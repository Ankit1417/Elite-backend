import mongoose, { Document, Schema } from "mongoose";

export type DealType = "GENERAL" | "BIRTHDAY";
export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export interface IDeal extends Document {
  name: string;
  description?: string;
  type: DealType;
  couponCodePrefix: string;
  discountType: DiscountType;
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  birthdayValidityDays?: number;
  usageLimit?: number;
  usageLimitPerUser?: number;
  isActive: boolean;
  notificationTitle?: string;
  notificationMessage?: string;
  redemptionCount: number;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DealSchema = new Schema<IDeal>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["GENERAL", "BIRTHDAY"],
      required: true,
    },
    couponCodePrefix: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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
      min: 0,
      default: 0,
    },
    maximumDiscountAmount: {
      type: Number,
      min: 0,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    birthdayValidityDays: {
      type: Number,
      min: 1,
      max: 365,
    },
    usageLimit: {
      type: Number,
      min: 1,
    },
    usageLimitPerUser: {
      type: Number,
      min: 1,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notificationTitle: {
      type: String,
      trim: true,
    },
    notificationMessage: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    redemptionCount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

DealSchema.index({ type: 1, isActive: 1, validFrom: 1, validUntil: 1 });
DealSchema.index({ createdAt: -1 });
DealSchema.index(
  { couponCodePrefix: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "GENERAL" },
    name: "unique_general_coupon_code",
  },
);

export const Deal = mongoose.model<IDeal>("Deal", DealSchema);
