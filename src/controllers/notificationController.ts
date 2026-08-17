import { Response } from "express";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../services/notificationService.js";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/appError.js";
import { parseOptionalBoolean, parsePagination } from "../utils/requestValidation.js";

export const handleGetNotifications = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const options = {
      unreadOnly: parseOptionalBoolean(req.query.unreadOnly, "Unread filter"),
      ...parsePagination(req.query.page, req.query.limit),
    };

    const result = await getUserNotifications(customerId, options);
    return sendSuccess(res, result);
  }
);

export const handleGetUnreadCount = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const result = await getUnreadCount(customerId);
    return sendSuccess(res, result);
  }
);

export const handleMarkAsRead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const notificationId = String(req.params.id);
    const notification = await markAsRead(notificationId, customerId);
    return sendSuccess(res, notification, 200, "Notification marked as read");
  }
);

export const handleMarkAllAsRead = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const result = await markAllAsRead(customerId);
    return sendSuccess(res, result, 200, "All notifications marked as read");
  }
);

export const handleDeleteNotification = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const notificationId = String(req.params.id);
    const result = await deleteNotification(notificationId, customerId);
    return sendSuccess(res, result);
  }
);
