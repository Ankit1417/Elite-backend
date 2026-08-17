import { Request, Response } from "express";
import {
  createOrder,
  getAdminOrders,
  getDashboardStats,
  getOrderById,
  getOrderByNumber,
  updateAdminNotes,
  updateOrderStatus,
  getCustomerOrders,
} from "../services/orderService.js";
import { OrderStatus, PaymentStatus, AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/appError.js";
import { parseOptionalEnum, parsePagination } from "../utils/requestValidation.js";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

export const handleCreateOrder = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const { customer, items, customerNotes, paymentMethod, couponCode } = req.body ?? {};
    const order = await createOrder({
      customerId,
      customer,
      items,
      customerNotes,
      paymentMethod,
      couponCode,
    });
    return sendSuccess(res, order, 201, "Order created successfully");
  }
);

export const handleGetOrderByNumber = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const orderNumber = String(req.params.orderNumber);
    const order = await getOrderByNumber(orderNumber);
    if (!order.customerId || order.customerId.toString() !== customerId) {
      throw new AppError("Order not found", 404);
    }
    return sendSuccess(res, order);
  }
);

export const handleGetOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const order = await getOrderById(id);
    return sendSuccess(res, order);
  }
);

export const handleGetAdminOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const options = {
      status: parseOptionalEnum<OrderStatus>(
        req.query.status,
        ORDER_STATUSES,
        "Order status",
      ),
      search: req.query.search ? String(req.query.search) : undefined,
      ...parsePagination(req.query.page, req.query.limit),
    };
    const result = await getAdminOrders(options);
    return sendSuccess(res, result);
  }
);

export const handleUpdateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { orderStatus, paymentStatus } = req.body;
    if (typeof orderStatus !== "string") throw new AppError("Order status is required", 400);
    const order = await updateOrderStatus(
      id,
      orderStatus as OrderStatus,
      paymentStatus as PaymentStatus
    );
    return sendSuccess(res, order, 200, "Order status updated successfully");
  }
);

export const handleUpdateAdminNotes = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { adminNotes } = req.body;
    const order = await updateAdminNotes(id, adminNotes);
    return sendSuccess(res, order, 200, "Admin notes updated successfully");
  }
);

export const handleGetDashboardStats = asyncHandler(
  async (_req: Request, res: Response) => {
    const stats = await getDashboardStats();
    return sendSuccess(res, stats);
  }
);

export const handleGetCustomerOrderById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    const orderId = String(req.params.id);
    
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }
    
    const order = await getOrderById(orderId);
    
    // Verify order belongs to the authenticated customer
    if (!order.customerId || order.customerId.toString() !== customerId) {
      throw new AppError("Order not found", 404);
    }
    
    return sendSuccess(res, order);
  }
);

export const handleGetCustomerOrders = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }
    const options = {
      status: parseOptionalEnum<OrderStatus>(
        req.query.status,
        ORDER_STATUSES,
        "Order status",
      ),
      ...parsePagination(req.query.page, req.query.limit),
    };
    const result = await getCustomerOrders(customerId, options);
    return sendSuccess(res, result);
  }
);
