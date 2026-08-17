import { Request } from "express";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type PaymentMethod = "COD" | "ESEWA";

export interface ICustomerPayload {
  role: "customer";
  customerId: string;
  phone: string;
  email?: string;
}

export interface IAdminPayload {
  role: "admin";
  adminId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  admin?: IAdminPayload;
  customer?: ICustomerPayload;
}
