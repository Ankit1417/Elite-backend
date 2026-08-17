import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { AuthenticatedRequest, IAdminPayload, ICustomerPayload } from "../types/index.js";
import { AppError } from "../utils/appError.js";

export function protectAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  let token: string | undefined = req.cookies?.admin_token;

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("Admin authentication required", 401));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<IAdminPayload>;
    if (
      decoded.role !== "admin" ||
      typeof decoded.adminId !== "string" ||
      typeof decoded.email !== "string"
    ) {
      return next(new AppError("Admin authentication required", 401));
    }
    req.admin = {
      role: "admin",
      adminId: decoded.adminId,
      email: decoded.email,
    };
    next();
  } catch {
    return next(new AppError("Invalid or expired session. Please log in again.", 401));
  }
}

export function protectCustomer(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  let token: string | undefined = req.cookies?.customer_token;

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("Authentication required", 401));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<ICustomerPayload>;
    if (
      decoded.role !== "customer" ||
      typeof decoded.customerId !== "string" ||
      typeof decoded.phone !== "string"
    ) {
      return next(new AppError("Authentication required", 401));
    }
    req.customer = {
      role: "customer",
      customerId: decoded.customerId,
      phone: decoded.phone,
      email: decoded.email,
    };
    next();
  } catch {
    return next(new AppError("Invalid or expired session. Please log in again.", 401));
  }
}
