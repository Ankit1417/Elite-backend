import mongoose, { Document, Schema } from "mongoose";

export interface ICustomer extends Document {
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  dateOfBirth?: Date;
  birthdayOffersEnabled: boolean;
  birthdayUpdatedAt?: Date;
  birthdayPromptDismissedAt?: Date;
  wishlist: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: Date,
    },
    birthdayOffersEnabled: {
      type: Boolean,
      default: false,
    },
    birthdayUpdatedAt: {
      type: Date,
    },
    birthdayPromptDismissedAt: {
      type: Date,
    },
    wishlist: [
      {
        type: Schema.Types.ObjectId,
        ref: "Book",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Customer = mongoose.model<ICustomer>("Customer", CustomerSchema);
