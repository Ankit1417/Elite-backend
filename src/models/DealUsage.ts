import mongoose, { Document, Schema } from "mongoose";

export interface IDealUsage extends Document {
  dealId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  scopeKey: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const DealUsageSchema = new Schema<IDealUsage>(
  {
    dealId: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    scopeKey: { type: String, required: true, trim: true },
    count: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

DealUsageSchema.index(
  { dealId: 1, userId: 1, scopeKey: 1 },
  { unique: true, name: "unique_deal_user_usage_scope" },
);

export const DealUsage = mongoose.model<IDealUsage>("DealUsage", DealUsageSchema);
