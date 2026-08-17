import mongoose, { Document, Schema } from "mongoose";
import { OrderStatus, PaymentMethod, PaymentStatus } from "../types/index.js";

export interface IOrderItem {
  bookId: mongoose.Types.ObjectId;
  title: string;
  coverImage: string;
  price: number;
  discountPercentage: number;
  finalPrice: number;
  quantity: number;
}

export interface IOrderCustomer {
  name: string;
  phone: string;
  email?: string;
  province: string;
  city: string;
  area: string;
  landmark?: string;
  deliveryNotes?: string;
}

export interface IOrder extends Document {
  orderNumber: string;
  customerId?: mongoose.Types.ObjectId;
  customer: IOrderCustomer;
  items: IOrderItem[];
  subtotal: number;
  discountAmount: number;
  itemDiscountAmount?: number;
  couponDiscountAmount?: number;
  couponCode?: string;
  couponId?: mongoose.Types.ObjectId;
  dealId?: mongoose.Types.ObjectId;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  customerNotes?: string;
  adminNotes?: string;
  stockRestored: boolean;
  statusVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
    },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true },
      province: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      area: { type: String, required: true, trim: true },
      landmark: { type: String, trim: true },
      deliveryNotes: { type: String, trim: true },
    },
    items: [
      {
        bookId: {
          type: Schema.Types.ObjectId,
          ref: "Book",
          required: true,
        },
        title: { type: String, required: true },
        coverImage: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
        finalPrice: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    itemDiscountAmount: {
      type: Number,
      min: 0,
    },
    couponDiscountAmount: {
      type: Number,
      min: 0,
    },
    couponCode: {
      type: String,
      trim: true,
    },
    couponId: {
      type: Schema.Types.ObjectId,
      ref: "IssuedCoupon",
    },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: "Deal",
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "ESEWA"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING",
    },
    orderStatus: {
      type: String,
      enum: [
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ],
      default: "PENDING",
    },
    customerNotes: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    stockRestored: {
      type: Boolean,
      default: false,
    },
    statusVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ orderStatus: 1, createdAt: -1 });
OrderSchema.index({ dealId: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>("Order", OrderSchema);
