import mongoose, { Document, Schema } from "mongoose";
import { DiscountType } from "./Deal.js";

export type CouponStatus = "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";

export interface IIssuedCoupon extends Document {
  dealId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  code: string;
  sourceCode?: string;
  isPersonalized: boolean;
  discountType: DiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  maximumDiscountAmount?: number;
  issuedAt: Date;
  validFrom: Date;
  expiresAt: Date;
  usedAt?: Date;
  usedOrderId?: mongoose.Types.ObjectId;
  status: CouponStatus;
  birthdayYear?: number;
  createdAt: Date;
  updatedAt: Date;
}

const IssuedCouponSchema = new Schema<IIssuedCoupon>(
  {
    dealId: {
      type: Schema.Types.ObjectId,
      ref: "Deal",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    sourceCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    isPersonalized: {
      type: Boolean,
      required: true,
      default: true,
    },
    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FIXED_AMOUNT"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumOrderAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    maximumDiscountAmount: {
      type: Number,
      min: 0,
    },
    issuedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
    },
    usedOrderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "USED", "EXPIRED", "REVOKED"],
      required: true,
      default: "ACTIVE",
    },
    birthdayYear: {
      type: Number,
      min: 1900,
    },
  },
  {
    timestamps: true,
  }
);

IssuedCouponSchema.virtual("displayCode").get(function () {
  return this.sourceCode || this.code;
});
IssuedCouponSchema.set("toJSON", { virtuals: true });
IssuedCouponSchema.index(
  { userId: 1, dealId: 1, birthdayYear: 1 },
  {
    unique: true,
    partialFilterExpression: { birthdayYear: { $type: "number" } },
    name: "unique_birthday_reward_per_year",
  },
);
IssuedCouponSchema.index({ userId: 1, status: 1, expiresAt: 1, issuedAt: -1 });
IssuedCouponSchema.index({ dealId: 1, status: 1, issuedAt: -1 });
IssuedCouponSchema.index({ status: 1, expiresAt: 1 });

export const IssuedCoupon = mongoose.model<IIssuedCoupon>("IssuedCoupon", IssuedCouponSchema);
