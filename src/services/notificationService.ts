import mongoose, { FilterQuery } from "mongoose";

import {
  INotification,
  Notification,
  NotificationType,
} from "../models/Notification.js";
import { DiscountType } from "../models/Deal.js";
import { AppError } from "../utils/appError.js";
import { formatDateOnly, getDatePartsInTimezone } from "../utils/businessDate.js";
import { APP_TIMEZONE } from "../config/env.js";

export interface ICreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}

function objectId(value: string, label: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label} ID`, 400);
  return new mongoose.Types.ObjectId(value);
}

export function renderNotificationTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : placeholder,
  );
}

export function formatDiscountLabel(type: DiscountType, value: number): string {
  return type === "PERCENTAGE" ? `${value}%` : `Rs. ${value}`;
}

export async function createNotification(input: ICreateNotificationInput) {
  const userId = objectId(input.userId, "customer");
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || title.length > 180) throw new AppError("Invalid notification title", 400);
  if (!message || message.length > 2000) throw new AppError("Invalid notification message", 400);

  const document = {
    userId,
    type: input.type,
    title,
    message,
    data: input.data,
    isRead: false,
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };
  if (!input.dedupeKey) return Notification.create(document);

  try {
    return await Notification.findOneAndUpdate(
      { dedupeKey: input.dedupeKey },
      { $setOnInsert: document },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      const existing = await Notification.findOne({ dedupeKey: input.dedupeKey });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function getUserNotifications(
  userId: string,
  options: { unreadOnly?: boolean; page?: number; limit?: number },
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const query: FilterQuery<INotification> = { userId: objectId(userId, "customer") };
  if (options.unreadOnly) query.isRead = false;
  const skip = (page - 1) * limit;
  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(query),
  ]);
  return { notifications, total, page, pages: Math.ceil(total / limit) };
}

export async function getUnreadCount(userId: string) {
  const count = await Notification.countDocuments({
    userId: objectId(userId, "customer"),
    isRead: false,
  });
  return { count };
}

export async function markAsRead(notificationId: string, userId: string) {
  const notificationObjectId = objectId(notificationId, "notification");
  const userObjectId = objectId(userId, "customer");
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationObjectId, userId: userObjectId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );
  if (!notification) {
    const existing = await Notification.findOne({
      _id: notificationObjectId,
      userId: userObjectId,
    });
    if (existing) return existing;
    throw new AppError("Notification not found", 404);
  }
  return notification;
}

export async function markAllAsRead(userId: string) {
  const result = await Notification.updateMany(
    { userId: objectId(userId, "customer"), isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return { modified: result.modifiedCount };
}

export async function deleteNotification(notificationId: string, userId: string) {
  const notification = await Notification.findOneAndDelete({
    _id: objectId(notificationId, "notification"),
    userId: objectId(userId, "customer"),
  });
  if (!notification) throw new AppError("Notification not found", 404);
  return { message: "Notification deleted successfully" };
}

export async function createOrderNotification(
  userId: string,
  orderNumber: string,
  type: NotificationType,
  title: string,
  message: string,
  options: {
    orderId?: string;
    dedupeKey?: string;
    data?: Record<string, unknown>;
  } = {},
) {
  return createNotification({
    userId,
    type,
    title,
    message,
    dedupeKey: options.dedupeKey,
    data: {
      ...(options.orderId ? { orderId: options.orderId } : {}),
      orderNumber,
      ...options.data,
    },
  });
}

export async function createBirthdayRewardNotification(
  userId: string,
  firstName: string,
  couponCode: string,
  discountValue: number,
  expiresAt: Date,
  options: {
    couponId?: string;
    dealId?: string;
    dealName?: string;
    discountType?: DiscountType;
    notificationTitle?: string;
    notificationMessage?: string;
    dedupeKey?: string;
  } = {},
) {
  const discountType = options.discountType ?? "PERCENTAGE";
  const discountLabel = formatDiscountLabel(discountType, discountValue);
  const expiry = formatDateOnly(getDatePartsInTimezone(expiresAt, APP_TIMEZONE));
  const variables = {
    firstName,
    couponCode,
    discount: String(discountValue),
    discountLabel,
    expiresAt: expiry,
    dealName: options.dealName ?? "Birthday Reward",
  };
  const title = renderNotificationTemplate(
    options.notificationTitle ?? "🎂 Happy Birthday, {firstName}!",
    variables,
  );
  const message = renderNotificationTemplate(
    options.notificationMessage ??
      "A special birthday gift from Elite Library is waiting for you. Enjoy {discountLabel} off your birthday order with code {couponCode}. Valid until {expiresAt}.",
    variables,
  );
  return createNotification({
    userId,
    type: "BIRTHDAY_REWARD",
    title,
    message,
    dedupeKey: options.dedupeKey,
    data: {
      ...(options.couponId ? { couponId: options.couponId } : {}),
      ...(options.dealId ? { dealId: options.dealId } : {}),
      couponCode,
      discountType,
      discountValue,
      expiresAt: expiresAt.toISOString(),
    },
  });
}
