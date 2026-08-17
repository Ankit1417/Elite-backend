import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "BIRTHDAY_REWARD"
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "ORDER_PROCESSING"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "ORDER_REFUNDED"
  | "DEAL"
  | "SYSTEM";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "BIRTHDAY_REWARD",
        "ORDER_PLACED",
        "ORDER_CONFIRMED",
        "ORDER_PROCESSING",
        "ORDER_SHIPPED",
        "ORDER_DELIVERED",
        "ORDER_CANCELLED",
        "ORDER_REFUNDED",
        "DEAL",
        "SYSTEM",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    dedupeKey: {
      type: String,
      trim: true,
    },
    isRead: {
      type: Boolean,
      required: true,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
    name: "unique_notification_dedupe_key",
  },
);

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
