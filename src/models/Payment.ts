import mongoose, { Document, Schema } from "mongoose";

export type PaymentGateway = "ESEWA" | "COD";
export type PaymentRecordStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "AMBIGUOUS"
  | "REFUNDED";

export interface IPayment extends Document {
  orderId: mongoose.Types.ObjectId;
  orderNumber: string;
  customerId: mongoose.Types.ObjectId;
  transactionUuid: string;
  paymentMethod: "COD" | "ESEWA";
  gateway: PaymentGateway;
  productCode: string;
  amount: number;
  taxAmount: number;
  productServiceCharge: number;
  productDeliveryCharge: number;
  totalAmount: number;
  status: PaymentRecordStatus;
  gatewayTransactionCode?: string;
  gatewayReferenceId?: string;
  gatewayResponse?: Record<string, unknown>;
  initiatedAt: Date;
  paidAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    transactionUuid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "ESEWA"],
      required: true,
      default: "ESEWA",
    },
    gateway: {
      type: String,
      enum: ["COD", "ESEWA"],
      required: true,
      default: "ESEWA",
    },
    productCode: {
      type: String,
      required: true,
      default: "EPAYTEST",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    productServiceCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    productDeliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "CANCELED", "AMBIGUOUS", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    gatewayTransactionCode: {
      type: String,
      trim: true,
    },
    gatewayReferenceId: {
      type: String,
      trim: true,
    },
    gatewayResponse: {
      type: Schema.Types.Mixed,
    },
    initiatedAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
