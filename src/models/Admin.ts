import mongoose, { Document, Schema } from "mongoose";

export interface IAdmin extends Document {
  email: string;
  phone?: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      default: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

export const Admin = mongoose.model<IAdmin>("Admin", AdminSchema);
