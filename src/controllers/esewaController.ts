import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/appError.js";
import { FRONTEND_URL } from "../config/env.js";
import {
  initiateEsewaPayment,
  processEsewaSuccess,
  processEsewaFailure,
} from "../services/esewaService.js";

/**
 * Controller to initiate eSewa payment for a customer's order.
 * POST /api/payments/esewa/initiate
 */
export const handleInitiateEsewaPayment = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const { orderId } = req.body ?? {};
    if (!orderId || typeof orderId !== "string") {
      throw new AppError("orderId is required", 400);
    }

    const result = await initiateEsewaPayment(customerId, orderId);
    return sendSuccess(res, result, 200, "eSewa payment initiated successfully");
  }
);

/**
 * Controller to handle eSewa browser success redirect callback.
 * GET /api/payments/esewa/success
 */
export const handleEsewaSuccessCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const data = req.query.data as string | undefined;

    if (!data) {
      console.warn("[eSewa Callback] Success callback called without data parameter");
      return res.redirect(`${FRONTEND_URL}/payment/failed?reason=missing_callback_data`);
    }

    try {
      const result = await processEsewaSuccess(data);
      const redirectUrl = `${FRONTEND_URL}/order-success?orderNumber=${encodeURIComponent(
        result.order.orderNumber
      )}&payment=esewa&status=success`;
      return res.redirect(redirectUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Payment verification failed";
      console.error("[eSewa Callback Error]:", message);
      const failureUrl = `${FRONTEND_URL}/payment/failed?reason=${encodeURIComponent(message)}`;
      return res.redirect(failureUrl);
    }
  }
);

/**
 * Controller to handle eSewa browser failure redirect callback.
 * GET /api/payments/esewa/failure
 */
export const handleEsewaFailureCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const data = req.query.data as string | undefined;
    let transactionUuid: string | undefined;

    if (data) {
      try {
        const decoded = JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
        transactionUuid = decoded.transaction_uuid;
      } catch {
        // Ignore decode error on failure callback
      }
    }

    const result = await processEsewaFailure(transactionUuid, "Cancelled or failed on eSewa");
    const failureUrl = result.orderNumber
      ? `${FRONTEND_URL}/payment/failed?orderNumber=${encodeURIComponent(
          result.orderNumber
        )}&reason=cancelled`
      : `${FRONTEND_URL}/payment/failed?reason=cancelled`;

    return res.redirect(failureUrl);
  }
);
