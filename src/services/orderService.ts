import crypto from "node:crypto";
import mongoose, { ClientSession, FilterQuery } from "mongoose";
import { Book } from "../models/Book.js";
import { IOrder, IOrderCustomer, IOrderItem, Order } from "../models/Order.js";
import { OrderStatus, PaymentStatus } from "../types/index.js";
import { AppError } from "../utils/appError.js";
import {
  CouponRedemption,
  redeemCoupon,
  releaseCouponRedemption,
} from "./issuedCouponService.js";
import { createOrderNotification } from "./notificationService.js";
import { DELIVERY_FEE } from "../config/env.js";
import { priceCartItems } from "./cartPricingService.js";
import { NotificationType } from "../models/Notification.js";
import { PaymentSettings } from "../models/PaymentSettings.js";
import { PaymentSettings } from "../models/PaymentSettings.js";

export interface ICreateOrderInput {
  customerId?: string;
  customer: IOrderCustomer;
  items: {
    bookId: string;
    quantity: number;
  }[];
  customerNotes?: string;
  paymentMethod?: "COD" | "ESEWA";
  couponCode?: string;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanRequiredText(value: unknown, field: string, maxLength = 160): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError(`${field} is required`, 400);
  const result = value.trim();
  if (result.length > maxLength) throw new AppError(`${field} is too long`, 400);
  return result;
}

export function validateOrderCustomer(value: unknown): IOrderCustomer {
  if (!value || typeof value !== "object") throw new AppError("Delivery details are required", 400);
  const input = value as Record<string, unknown>;
  const email = input.email === undefined || input.email === "" ? undefined : cleanRequiredText(input.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Please enter a valid email address", 400);
  }
  return {
    name: cleanRequiredText(input.name, "Customer name"),
    phone: cleanRequiredText(input.phone, "Phone", 32),
    email,
    province: cleanRequiredText(input.province, "Province", 120),
    city: cleanRequiredText(input.city, "City", 120),
    area: cleanRequiredText(input.area, "Area", 240),
    landmark:
      input.landmark === undefined || input.landmark === ""
        ? undefined
        : cleanRequiredText(input.landmark, "Landmark", 240),
    deliveryNotes:
      input.deliveryNotes === undefined || input.deliveryNotes === ""
        ? undefined
        : cleanRequiredText(input.deliveryNotes, "Delivery notes", 1000),
  };
}

export function isTransactionUnsupported(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: number; message?: string };
  return (
    candidate.code === 20 ||
    candidate.code === 303 ||
    /transaction numbers are only allowed|replica set member or mongos|does not support transactions|does not support sessions|current topology does not support/i.test(
      candidate.message ?? "",
    )
  );
}

interface OrderOperationResult {
  order: IOrder;
  deductedItems: { bookId: mongoose.Types.ObjectId; quantity: number }[];
  redemption?: CouponRedemption;
}

async function assertPaymentMethodEnabled(
  paymentMethod: "COD" | "ESEWA",
  session?: ClientSession,
): Promise<void> {
  const query = PaymentSettings.findOne();
  if (session) query.session(session);
  const settings = await query;
  const isEnabled =
    paymentMethod === "COD"
      ? (settings?.cashOnDeliveryEnabled ?? true)
      : (settings?.esewaEnabled ?? false);

  if (!isEnabled) {
    throw new AppError(
      paymentMethod === "COD"
        ? "Cash on delivery is currently unavailable"
        : "eSewa is currently unavailable",
      409,
    );
  }
}

async function performOrderOperation(
  input: ICreateOrderInput,
  orderId: mongoose.Types.ObjectId,
  orderNumber: string,
  session?: ClientSession,
  compensateOnFailure = false,
): Promise<OrderOperationResult> {
  const customer = validateOrderCustomer(input.customer);
  if (!input.customerId || !mongoose.Types.ObjectId.isValid(input.customerId)) {
    throw new AppError("Authentication is required to place an order", 401);
  }
  const paymentMethod = input.paymentMethod ?? "COD";
  if (!(["COD", "ESEWA"] as const).includes(paymentMethod)) {
    throw new AppError("Invalid payment method", 400);
  }
  await assertPaymentMethodEnabled(paymentMethod, session);
  const paymentSettingsQuery = PaymentSettings.findOne();
  if (session) paymentSettingsQuery.session(session);
  const paymentSettings = await paymentSettingsQuery;
  const paymentMethodEnabled =
    paymentMethod === "COD"
      ? (paymentSettings?.cashOnDeliveryEnabled ?? true)
      : (paymentSettings?.esewaEnabled ?? false);
  if (!paymentMethodEnabled) {
    throw new AppError("The selected payment method is currently unavailable", 409);
  }
  const customerNotes =
    input.customerNotes === undefined || input.customerNotes === ""
      ? undefined
      : cleanRequiredText(input.customerNotes, "Customer notes", 1000);
  if (input.couponCode !== undefined && typeof input.couponCode !== "string") {
    throw new AppError("Coupon code must be a string", 400);
  }

  const pricing = await priceCartItems(input.items, session);
  const deductedItems: { bookId: mongoose.Types.ObjectId; quantity: number }[] = [];
  let redemption: CouponRedemption | undefined;
  try {
    for (const item of pricing.items) {
      const updated = await Book.findOneAndUpdate(
        {
          _id: item.bookId,
          isActive: true,
          price: item.price,
          finalPrice: item.finalPrice,
          stockQuantity: { $gte: item.quantity },
        },
        { $inc: { stockQuantity: -item.quantity } },
        { new: true, ...(session ? { session } : {}) },
      );
      if (!updated) {
        throw new AppError(
          `Stock changed during checkout for "${item.title}". Please refresh and try again.`,
          409,
        );
      }
      deductedItems.push({ bookId: item.bookId, quantity: item.quantity });
    }

    if (input.couponCode?.trim()) {
      redemption = await redeemCoupon(
        {
          code: input.couponCode,
          userId: input.customerId,
          orderId: orderId.toString(),
          orderAmount: pricing.merchandiseAmount,
        },
        { session },
      );
    }

    const couponDiscountAmount = redemption?.discountAmount ?? 0;
    const totalDiscount = money(pricing.itemDiscountAmount + couponDiscountAmount);
    const totalAmount = money(
      Math.max(0, pricing.merchandiseAmount - couponDiscountAmount + DELIVERY_FEE),
    );
    const order = new Order({
      _id: orderId,
      orderNumber,
      customerId: new mongoose.Types.ObjectId(input.customerId),
      customer,
      items: pricing.items,
      subtotal: pricing.subtotal,
      itemDiscountAmount: pricing.itemDiscountAmount,
      couponDiscountAmount,
      discountAmount: totalDiscount,
      couponCode: redemption?.code,
      couponId: redemption?.couponId,
      dealId: redemption?.dealId,
      deliveryFee: DELIVERY_FEE,
      totalAmount,
      paymentMethod,
      paymentStatus: "PENDING",
      orderStatus: "PENDING",
      customerNotes,
      stockRestored: false,
      statusVersion: 0,
    });
    const savedOrder = await order.save(session ? { session } : undefined);
    return { order: savedOrder, deductedItems, redemption };
  } catch (error) {
    if (compensateOnFailure) {
      if (redemption) {
        try {
          await releaseCouponRedemption(redemption);
        } catch (rollbackError) {
          console.error("Coupon rollback failed:", rollbackError);
        }
      }
      for (const deducted of deductedItems) {
        try {
          await Book.updateOne(
            { _id: deducted.bookId },
            { $inc: { stockQuantity: deducted.quantity } },
          );
        } catch (rollbackError) {
          console.error("Stock rollback failed:", rollbackError);
        }
      }
    }
    throw error;
  }
}

export async function createOrder(input: ICreateOrderInput) {
  const orderId = new mongoose.Types.ObjectId();
  const orderNumber = `EL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  let result: OrderOperationResult | undefined;
  let session: ClientSession | undefined;
  try {
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        result = await performOrderOperation(input, orderId, orderNumber, session, false);
      });
    } catch (error) {
      if (!isTransactionUnsupported(error)) throw error;
      result = await performOrderOperation(input, orderId, orderNumber, undefined, true);
    }
  } finally {
    if (session) await session.endSession();
  }
  if (!result) throw new AppError("Order could not be created", 500);

  if (input.customerId) {
    try {
      await createOrderNotification(
        input.customerId,
        orderNumber,
        "ORDER_PLACED",
        "Order Received",
        `We've received your Elite Library order #${orderNumber}.`,
        {
          orderId: orderId.toString(),
          dedupeKey: `order:${orderId}:placed`,
        },
      );
    } catch (error) {
      console.error("Failed to create order notification:", error);
    }
  }
  return result.order;
}

export async function getOrderByNumber(orderNumber: string) {
  const order = await Order.findOne({ orderNumber });
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  return order;
}

export async function getOrderById(id: string) {
  const order = await Order.findById(id);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  return order;
}

export async function getCustomerOrders(customerId: string, options: {
  status?: OrderStatus;
  page?: number;
  limit?: number;
}) {
  const { status, page = 1, limit = 20 } = options;

  const query: FilterQuery<IOrder> = { customerId: new mongoose.Types.ObjectId(customerId) };

  if (status) {
    query.orderStatus = status;
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(query),
  ]);

  return {
    orders,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function getAdminOrders(options: {
  status?: OrderStatus;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { status, search, page = 1, limit = 20 } = options;

  const query: FilterQuery<IOrder> = {};

  if (status) {
    query.orderStatus = status;
  }

  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { "customer.name": { $regex: search, $options: "i" } },
      { "customer.phone": { $regex: search, $options: "i" } },
      { "customer.city": { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(query),
  ]);

  return {
    orders,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus,
  paymentStatus?: PaymentStatus
) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid order ID", 400);
  const allowedStatuses: OrderStatus[] = [
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ];
  const allowedPaymentStatuses: PaymentStatus[] = ["PENDING", "PAID", "FAILED", "REFUNDED"];
  if (!allowedStatuses.includes(newStatus)) throw new AppError("Invalid order status", 400);
  if (
    paymentStatus !== undefined &&
    !allowedPaymentStatuses.includes(paymentStatus)
  ) {
    throw new AppError("Invalid payment status", 400);
  }

  const order = await Order.findById(id);
  if (!order) throw new AppError("Order not found", 404);
  const oldStatus = order.orderStatus;
  if (oldStatus !== newStatus && !isAllowedOrderTransition(oldStatus, newStatus)) {
    throw new AppError(`Order cannot move from ${oldStatus} to ${newStatus}`, 409);
  }
  const oldPaymentStatus = order.paymentStatus;
  const nextPaymentStatus =
    paymentStatus ??
    (newStatus === "DELIVERED" && order.paymentMethod === "COD"
      ? "PAID"
      : oldPaymentStatus);
  const statusChanged = oldStatus !== newStatus;
  const paymentChanged = oldPaymentStatus !== nextPaymentStatus;
  if (!statusChanged && !paymentChanged) return order;

  const shouldRestoreStock = newStatus === "CANCELLED" && !order.stockRestored;
  const version = order.statusVersion ?? 0;
  const versionFilter =
    version === 0
      ? { $or: [{ statusVersion: 0 }, { statusVersion: { $exists: false } }] }
      : { statusVersion: version };
  const savedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      orderStatus: oldStatus,
      paymentStatus: oldPaymentStatus,
      ...versionFilter,
    },
    {
      $set: {
        orderStatus: newStatus,
        paymentStatus: nextPaymentStatus,
        ...(shouldRestoreStock ? { stockRestored: true } : {}),
      },
      $inc: { statusVersion: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!savedOrder) {
    const current = await Order.findById(id);
    if (
      current &&
      current.orderStatus === newStatus &&
      current.paymentStatus === nextPaymentStatus
    ) {
      return current;
    }
    throw new AppError("Order changed while it was being updated. Please retry.", 409);
  }

  if (shouldRestoreStock) {
    const restored: { bookId: mongoose.Types.ObjectId; quantity: number }[] = [];
    try {
      for (const item of savedOrder.items) {
        const result = await Book.updateOne(
          { _id: item.bookId },
          { $inc: { stockQuantity: item.quantity } },
        );
        if (result.matchedCount !== 1) {
          throw new AppError(`Cannot restore stock for "${item.title}"`, 409);
        }
        restored.push({ bookId: item.bookId, quantity: item.quantity });
      }
    } catch (error) {
      for (const item of restored) {
        try {
          await Book.updateOne(
            { _id: item.bookId, stockQuantity: { $gte: item.quantity } },
            { $inc: { stockQuantity: -item.quantity } },
          );
        } catch (rollbackError) {
          console.error("Cancellation stock rollback failed:", rollbackError);
        }
      }
      try {
        await Order.findOneAndUpdate(
          { _id: savedOrder._id, statusVersion: savedOrder.statusVersion },
          {
            $set: {
              orderStatus: oldStatus,
              paymentStatus: oldPaymentStatus,
              stockRestored: order.stockRestored,
            },
            $inc: { statusVersion: -1 },
          },
        );
      } catch (rollbackError) {
        console.error("Cancellation order rollback failed:", rollbackError);
      }
      throw error;
    }
  }

  if (savedOrder.customerId) {
    const notifications = [
      ...(statusChanged
        ? [getOrderNotificationDescriptor(savedOrder.orderNumber, newStatus)]
        : []),
      ...(paymentChanged && nextPaymentStatus === "REFUNDED"
        ? [
            {
              type: "ORDER_REFUNDED" as NotificationType,
              title: "Payment Refunded",
              message: `Payment for order #${savedOrder.orderNumber} has been refunded.`,
              key: "payment:REFUNDED",
            },
          ]
        : []),
    ].filter((item): item is OrderNotificationDescriptor => Boolean(item));
    for (const notification of notifications) {
      try {
        await createOrderNotification(
          savedOrder.customerId.toString(),
          savedOrder.orderNumber,
          notification.type,
          notification.title,
          notification.message,
          {
            orderId: savedOrder._id.toString(),
            dedupeKey: `order:${savedOrder._id}:${notification.key}`,
          },
        );
      } catch (error) {
        console.error("Failed to create order status notification:", error);
      }
    }
  }
  return savedOrder;
}

export interface OrderNotificationDescriptor {
  type: NotificationType;
  title: string;
  message: string;
  key: string;
}

export function isAllowedOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  if (from === "DELIVERED" || from === "CANCELLED") return false;
  if (to === "CANCELLED") return true;

  const fulfillmentRank: Partial<Record<OrderStatus, number>> = {
    PENDING: 0,
    CONFIRMED: 1,
    PROCESSING: 2,
    SHIPPED: 3,
    DELIVERED: 4,
  };
  return (fulfillmentRank[to] ?? -1) > (fulfillmentRank[from] ?? -1);
}

export function getOrderNotificationDescriptor(
  orderNumber: string,
  status: OrderStatus,
): OrderNotificationDescriptor | null {
  const descriptors: Partial<Record<OrderStatus, Omit<OrderNotificationDescriptor, "key">>> = {
    CONFIRMED: {
      type: "ORDER_CONFIRMED",
      title: "Order Confirmed",
      message: `Your order #${orderNumber} has been confirmed.`,
    },
    PROCESSING: {
      type: "ORDER_PROCESSING",
      title: "Preparing Your Books",
      message: `Your order #${orderNumber} is being prepared.`,
    },
    SHIPPED: {
      type: "ORDER_SHIPPED",
      title: "Your Books Are On The Way",
      message: `Order #${orderNumber} has been shipped.`,
    },
    DELIVERED: {
      type: "ORDER_DELIVERED",
      title: "Delivered",
      message: `Your Elite Library order #${orderNumber} has been delivered. Happy reading!`,
    },
    CANCELLED: {
      type: "ORDER_CANCELLED",
      title: "Order Cancelled",
      message: `Order #${orderNumber} has been cancelled.`,
    },
  };
  const descriptor = descriptors[status];
  return descriptor ? { ...descriptor, key: `status:${status}` } : null;
}

export async function updateAdminNotes(id: string, adminNotes: string) {
  const order = await Order.findById(id);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  order.adminNotes = adminNotes;
  return order.save();
}

export async function getDashboardStats() {
  const [
    totalBooks,
    activeBooks,
    lowStockBooks,
    outOfStockBooks,
    totalOrders,
    pendingOrders,
    deliveredOrders,
    salesData,
    recentOrders,
    lowStockList,
  ] = await Promise.all([
    Book.countDocuments(),
    Book.countDocuments({ isActive: true }),
    Book.countDocuments({ stockQuantity: { $gt: 0, $lte: 5 } }),
    Book.countDocuments({ stockQuantity: 0 }),
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: "PENDING" }),
    Order.countDocuments({ orderStatus: "DELIVERED" }),
    Order.aggregate([
      {
        $match: {
          $or: [{ orderStatus: "DELIVERED" }, { paymentStatus: "PAID" }],
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
        },
      },
    ]),
    Order.find().sort({ createdAt: -1 }).limit(5),
    Book.find({ stockQuantity: { $lte: 5 } })
      .select("title author coverImage stockQuantity price finalPrice")
      .limit(5),
  ]);

  const totalSales = salesData.length > 0 ? salesData[0].totalSales : 0;

  return {
    books: {
      total: totalBooks,
      active: activeBooks,
      lowStock: lowStockBooks,
      outOfStock: outOfStockBooks,
    },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      delivered: deliveredOrders,
      totalSales,
    },
    recentOrders,
    lowStockList,
  };
}
