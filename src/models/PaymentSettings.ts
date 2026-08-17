import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentSettings extends Document {
  cashOnDeliveryEnabled: boolean;
  esewaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSettingsSchema = new Schema<IPaymentSettings>(
  {
    cashOnDeliveryEnabled: {
      type: Boolean,
      default: true,
    },
    esewaEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one payment settings document exists
PaymentSettingsSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingSettings = await PaymentSettings.findOne();
    if (existingSettings) {
      const error = new Error('Only one payment settings document can exist');
      return next(error);
    }
  }
  next();
});

export const PaymentSettings = mongoose.model<IPaymentSettings>("PaymentSettings", PaymentSettingsSchema);
