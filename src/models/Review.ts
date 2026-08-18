import mongoose, { Document, Schema } from "mongoose";
import { ReviewStatus } from "../types/index.js";

export interface IReview extends Document {
  book: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    book: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["published", "hidden", "rejected"],
      default: "published",
    },
  },
  {
    timestamps: true,
  }
);

// One customer can review a given book at most once (enforced at DB level).
ReviewSchema.index({ customer: 1, book: 1 }, { unique: true });
// Public review listing and moderation queries.
ReviewSchema.index({ book: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ book: 1, createdAt: -1 });
ReviewSchema.index({ book: 1, rating: 1 });

export const Review = mongoose.model<IReview>("Review", ReviewSchema);