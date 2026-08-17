import bcrypt from "bcryptjs";
import { Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../config/env.js";
import { Admin } from "../models/Admin.js";
import { AppError } from "../utils/appError.js";

function normalizePhone(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");
  
  // If it starts with 977 (Nepal country code), remove it for consistency
  if (cleaned.startsWith("977") && cleaned.length === 13) {
    return cleaned.substring(3);
  }
  
  return cleaned;
}

function isEmail(identifier: string): boolean {
  return identifier.includes("@");
}

export async function loginAdmin(identifier: string, password: string, res: Response) {
  const trimmedIdentifier = identifier.trim();
  
  let admin;
  if (isEmail(trimmedIdentifier)) {
    // Login with email
    admin = await Admin.findOne({ email: trimmedIdentifier.toLowerCase() });
  } else {
    // Login with phone
    const normalizedPhone = normalizePhone(trimmedIdentifier);
    admin = await Admin.findOne({ phone: normalizedPhone });
  }

  if (!admin) {
    throw new AppError("Invalid credentials", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isPasswordValid) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = jwt.sign(
    { role: "admin", adminId: admin._id.toString(), email: admin.email },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.cookie("admin_token", token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
  });

  return {
    admin: {
      id: admin._id,
      email: admin.email,
      phone: admin.phone,
      name: admin.name,
    },
    token,
  };
}

export function logoutAdmin(res: Response) {
  res.clearCookie("admin_token", {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
  });
}
