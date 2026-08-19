import crypto from "node:crypto";
import mongoose from "mongoose";
import { Order, IOrder } from "../models/Order.js";
import { Payment, IPayment } from "../models/Payment.js";
import { PaymentSettings } from "../models/PaymentSettings.js";
import {
  ESEWA_PRODUCT_CODE,
  ESEWA_SECRET_KEY,
  ESEWA_PAYMENT_URL,
  ESEWA_STATUS_URL,
  ESEWA_SUCCESS_URL,
  ESEWA_FAILURE_URL,
} from "../config/env.js";
import { AppError } from "../utils/appError.js";
import { createOrderNotification } from "./notificationService.js";

export interface EsewaInitiationFields {
  amount: string;
  tax_amount: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  product_service_charge: string;
  product_delivery_charge: string;
  success_url: string;
  failure_url: string;
  signed_field_names: string;
  signature: string;
}

export interface EsewaInitiationResult {
  paymentUrl: string;
  orderNumber: string;
  fields: EsewaInitiationFields;
}

export interface EsewaDecodedResponse {
  transaction_code: string;
  status: string;
  total_amount: string | number;
  transaction_uuid: string;
  product_code: string;
  signed_field_names: string;
  signature: string;
  [key: string]: unknown;
}

export interface EsewaStatusApiResponse {
  product_code: string;
  status: string;
  total_amount: number | string;
  transaction_uuid: string;
  transaction_code?: string;
  [key: string]: unknown;
}

/**
 * Generates an HMAC-SHA256 Base64 signature as required by eSewa ePay V2.
 */
export function generateEsewaSignature(message: string, secretKey: string = ESEWA_SECRET_KEY): string {
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

/**
 * Verifies the integrity of an eSewa response by reconstructing the signed message
 * based on signed_field_names and doing a timing-safe HMAC-SHA256 signature comparison.
 */
export function verifyEsewaResponseSignature(
  response: EsewaDecodedResponse,
  secretKey: string = ESEWA_SECRET_KEY
): boolean {
  if (!response.signed_field_names || !response.signature) {
    return false;
  }

  const fieldNames = response.signed_field_names.split(",").map((f) => f.trim());
  const messageParts: string[] = [];

  for (const field of fieldNames) {
    if (field === "signature") continue;
    const value = response[field];
    if (value === undefined || value === null) {
      return false;
    }
    messageParts.push(`${field}=${value}`);
  }

  const message = messageParts.join(",");
  const expectedSignature = generateEsewaSignature(message, secretKey);

  try {
    const expectedBuf = Buffer.from(expectedSignature, "utf-8");
    const actualBuf = Buffer.from(response.signature, "utf-8");
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Initiates an eSewa payment for a customer order.
 * Calculates all payment breakdown amounts on the server side and generates
 * HMAC-SHA256 signed payload fields for form submission.
 */
export async function initiateEsewaPayment(
  customerId: string,
  orderId: string
): Promise<EsewaInitiationResult> {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError("Invalid order ID", 400);
  }

  // Check if eSewa is enabled in settings
  const paymentSettings = await PaymentSettings.findOne();
  const isEsewaEnabled = paymentSettings?.esewaEnabled ?? false;
  if (!isEsewaEnabled) {
    throw new AppError("eSewa payment is currently unavailable", 409);
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (!order.customerId || order.customerId.toString() !== customerId) {
    throw new AppError("You do not have access to this order", 403);
  }

  if (order.paymentStatus === "PAID") {
    throw new AppError("Order is already paid", 400);
  }

  if (order.orderStatus === "CANCELLED") {
    throw new AppError("Cannot pay for a cancelled order", 400);
  }

  // Calculate breakdown amounts entirely on the backend
  const deliveryCharge = order.deliveryFee ?? 0;
  const merchandiseAmount = Math.max(0, order.totalAmount - deliveryCharge);
  const taxAmount = 0; // Tax is not applied in current pricing
  const serviceCharge = 0; // Service charge is not applied in current pricing
  const totalAmount = merchandiseAmount + taxAmount + serviceCharge + deliveryCharge;

  // Strict backend verification of amount equality
  if (Math.abs(totalAmount - order.totalAmount) > 0.01) {
    throw new AppError("Order amount calculation mismatch", 500);
  }

  // Generate unique transaction UUID (alphanumeric and hyphens only)
  const uniqueSuffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
  const transactionUuid = `EL-${order.orderNumber}-${uniqueSuffix}`;

  const signedFieldNames = "total_amount,transaction_uuid,product_code";
  const signingMessage = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${ESEWA_PRODUCT_CODE}`;
  const signature = generateEsewaSignature(signingMessage, ESEWA_SECRET_KEY);

  // Persist pending payment record in DB
  const payment = new Payment({
    orderId: order._id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    transactionUuid,
    paymentMethod: "ESEWA",
    gateway: "ESEWA",
    productCode: ESEWA_PRODUCT_CODE,
    amount: merchandiseAmount,
    taxAmount,
    productServiceCharge: serviceCharge,
    productDeliveryCharge: deliveryCharge,
    totalAmount,
    status: "PENDING",
    initiatedAt: new Date(),
  });
  await payment.save();

  return {
    paymentUrl: ESEWA_PAYMENT_URL,
    orderNumber: order.orderNumber,
    fields: {
      amount: merchandiseAmount.toString(),
      tax_amount: taxAmount.toString(),
      total_amount: totalAmount.toString(),
      transaction_uuid: transactionUuid,
      product_code: ESEWA_PRODUCT_CODE,
      product_service_charge: serviceCharge.toString(),
      product_delivery_charge: deliveryCharge.toString(),
      success_url: ESEWA_SUCCESS_URL,
      failure_url: ESEWA_FAILURE_URL,
      signed_field_names: signedFieldNames,
      signature,
    },
  };
}

/**
 * Calls eSewa's official Transaction Status API to perform server-to-server validation.
 */
export async function checkEsewaTransactionStatus(
  productCode: string,
  totalAmount: number,
  transactionUuid: string
): Promise<EsewaStatusApiResponse> {
  const queryParams = new URLSearchParams({
    product_code: productCode,
    total_amount: totalAmount.toString(),
    transaction_uuid: transactionUuid,
  });

  const url = `${ESEWA_STATUS_URL}?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "EliteLibrary-PaymentClient/1.0",
    },
  });

  if (!response.ok) {
    throw new AppError(`eSewa status verification server returned HTTP ${response.status}`, 502);
  }

  const json = (await response.json()) as EsewaStatusApiResponse;
  return json;
}

export interface EsewaCallbackSuccessResult {
  success: boolean;
  order: IOrder;
  payment: IPayment;
  isDuplicate: boolean;
}

/**
 * Handles and verifies the eSewa success callback.
 * 1. Base64 decodes data
 * 2. Verifies HMAC-SHA256 response signature
 * 3. Verifies transaction_uuid, product_code, and total amount against DB
 * 4. Calls eSewa server-to-server transaction status verification API
 * 5. Idempotently marks payment & order as PAID
 */
export async function processEsewaSuccess(base64Data: string): Promise<EsewaCallbackSuccessResult> {
  if (!base64Data || typeof base64Data !== "string") {
    throw new AppError("Invalid eSewa response payload", 400);
  }

  let decodedPayload: EsewaDecodedResponse;
  try {
    const jsonStr = Buffer.from(base64Data, "base64").toString("utf-8");
    decodedPayload = JSON.parse(jsonStr) as EsewaDecodedResponse;
  } catch {
    throw new AppError("Failed to decode eSewa response payload", 400);
  }

  if (!decodedPayload.transaction_uuid || !decodedPayload.signature) {
    throw new AppError("Missing required transaction fields in eSewa response", 400);
  }

  // 1. Verify response HMAC-SHA256 signature
  const isSignatureValid = verifyEsewaResponseSignature(decodedPayload, ESEWA_SECRET_KEY);
  if (!isSignatureValid) {
    console.error("[eSewa Security] Signature verification failed for payload:", {
      transaction_uuid: decodedPayload.transaction_uuid,
      product_code: decodedPayload.product_code,
    });
    throw new AppError("eSewa response signature verification failed", 400);
  }

  // 2. Find corresponding internal payment record
  const payment = await Payment.findOne({ transactionUuid: decodedPayload.transaction_uuid });
  if (!payment) {
    throw new AppError(`No matching payment record found for transaction ${decodedPayload.transaction_uuid}`, 404);
  }

  const order = await Order.findById(payment.orderId);
  if (!order) {
    throw new AppError(`No matching order found for payment ${payment._id}`, 404);
  }

  // 3. Idempotency Check: if already marked PAID, return without duplicate updates
  if (payment.status === "PAID" && order.paymentStatus === "PAID") {
    return {
      success: true,
      order,
      payment,
      isDuplicate: true,
    };
  }

  // 4. Verify product code
  if (decodedPayload.product_code !== payment.productCode || decodedPayload.product_code !== ESEWA_PRODUCT_CODE) {
    payment.status = "FAILED";
    payment.failureReason = `Product code mismatch: received ${decodedPayload.product_code}, expected ${ESEWA_PRODUCT_CODE}`;
    payment.failedAt = new Date();
    await payment.save();
    throw new AppError("Product code mismatch in payment callback", 400);
  }

  // 5. Verify total amount with decimal precision
  const callbackAmount = Number(decodedPayload.total_amount);
  if (isNaN(callbackAmount) || Math.abs(callbackAmount - payment.totalAmount) > 0.01) {
    payment.status = "FAILED";
    payment.failureReason = `Amount mismatch: received ${callbackAmount}, expected ${payment.totalAmount}`;
    payment.failedAt = new Date();
    await payment.save();
    throw new AppError("Payment amount mismatch in callback", 400);
  }

  // 6. Server-to-server transaction status verification from eSewa API
  let statusResult: EsewaStatusApiResponse;
  try {
    statusResult = await checkEsewaTransactionStatus(
      payment.productCode,
      payment.totalAmount,
      payment.transactionUuid
    );
  } catch (error) {
    console.error("[eSewa Status Check Error]:", error);
    payment.status = "AMBIGUOUS";
    payment.failureReason = error instanceof Error ? error.message : "Status API verification failed";
    await payment.save();
    throw new AppError("Failed to verify transaction status with eSewa servers", 502);
  }

  if (statusResult.status !== "COMPLETE") {
    payment.status = statusResult.status === "CANCELED" ? "CANCELED" : "FAILED";
    payment.failureReason = `eSewa status check returned: ${statusResult.status}`;
    payment.failedAt = new Date();
    payment.gatewayResponse = statusResult as Record<string, unknown>;
    await payment.save();
    throw new AppError(`eSewa transaction is not complete (Status: ${statusResult.status})`, 400);
  }

  // 7. Update Payment record to PAID
  payment.status = "PAID";
  payment.paidAt = new Date();
  payment.gatewayTransactionCode = decodedPayload.transaction_code || statusResult.transaction_code;
  payment.gatewayResponse = { ...decodedPayload, statusApiResult: statusResult };
  await payment.save();

  // 8. Update Order payment status and advance order status if PENDING
  order.paymentStatus = "PAID";
  if (order.orderStatus === "PENDING") {
    order.orderStatus = "CONFIRMED";
  }
  await order.save();

  // 9. Send order notification
  if (order.customerId) {
    try {
      await createOrderNotification(
        order.customerId.toString(),
        order.orderNumber,
        "ORDER_CONFIRMED",
        "Payment Received & Order Confirmed",
        `Payment of Rs. ${order.totalAmount.toLocaleString()} received via eSewa for order #${order.orderNumber}.`,
        {
          orderId: order._id.toString(),
          dedupeKey: `order:${order._id}:paid_esewa`,
        }
      );
    } catch (notifErr) {
      console.error("Failed to send order notification:", notifErr);
    }
  }

  return {
    success: true,
    order,
    payment,
    isDuplicate: false,
  };
}

/**
 * Handles eSewa failure callback.
 */
export async function processEsewaFailure(transactionUuid?: string, reason?: string) {
  if (transactionUuid) {
    const payment = await Payment.findOne({ transactionUuid });
    if (payment && payment.status !== "PAID") {
      payment.status = "FAILED";
      payment.failureReason = reason || "Payment was cancelled or failed on eSewa gateway";
      payment.failedAt = new Date();
      await payment.save();

      const order = await Order.findById(payment.orderId);
      if (order && order.paymentStatus === "PENDING") {
        order.paymentStatus = "FAILED";
        await order.save();
      }
      return { orderNumber: order?.orderNumber };
    }
  }
  return { orderNumber: undefined };
}
