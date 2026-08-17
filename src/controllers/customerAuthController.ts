import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Customer } from "../models/Customer.js";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { APP_TIMEZONE, JWT_SECRET, NODE_ENV } from "../config/env.js";
import { AppError } from "../utils/appError.js";
import {
  assertDateIsNotFuture,
  canChangeBirthday,
  formatStoredDateOnly,
  parseStrictDateOnly,
} from "../utils/businessDate.js";

const CUSTOMER_COOKIE_NAME = "customer_token";
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours

function serializeCustomer(customer: InstanceType<typeof Customer>) {
  return {
    id: customer._id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    dateOfBirth: formatStoredDateOnly(customer.dateOfBirth),
    birthdayOffersEnabled: customer.birthdayOffersEnabled ?? false,
    birthdayUpdatedAt: customer.birthdayUpdatedAt ?? null,
    birthdayPromptDismissedAt: customer.birthdayPromptDismissedAt ?? null,
  };
}

function validateEmail(value: unknown): string | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new AppError("Email must be a string", 400);
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Please enter a valid email address", 400);
  }
  return email;
}

export const handleCustomerSignup = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, phone, email, password, confirmPassword } = req.body;

    if (!name || !phone || !password) {
      throw new AppError("Name, phone, and password are required", 400);
    }

    if (password !== confirmPassword) {
      throw new AppError("Passwords do not match", 400);
    }

    if (password.length < 6) {
      throw new AppError("Password must be at least 6 characters", 400);
    }

    // Check if phone already exists
    const existingPhone = await Customer.findOne({ phone });
    if (existingPhone) {
      throw new AppError("Phone number already registered", 409);
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await Customer.findOne({ email });
      if (existingEmail) {
        throw new AppError("Email already registered", 409);
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create customer
    const customer = await Customer.create({
      name,
      phone,
      email: email || undefined,
      passwordHash,
    });

    // Generate JWT
    const token = jwt.sign(
      {
        role: "customer",
        customerId: customer._id.toString(),
        phone: customer.phone,
        email: customer.email,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    // Set HTTP-only cookie
    res.cookie(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "strict" : "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return sendSuccess(
      res,
      {
        customer: serializeCustomer(customer),
      },
      201,
      "Account created successfully"
    );
  }
);

export const handleCustomerLogin = asyncHandler(
  async (req: Request, res: Response) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      throw new AppError("Identifier and password are required", 400);
    }

    // Find customer by phone or email
    const customer = await Customer.findOne({
      $or: [{ phone: identifier }, { email: identifier }],
    });

    if (!customer) {
      throw new AppError("Invalid credentials", 401);
    }

    if (!customer.isActive) {
      throw new AppError("Account is inactive", 403);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, customer.passwordHash);
    if (!isValidPassword) {
      throw new AppError("Invalid credentials", 401);
    }

    // Generate JWT
    const token = jwt.sign(
      {
        role: "customer",
        customerId: customer._id.toString(),
        phone: customer.phone,
        email: customer.email,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    // Set HTTP-only cookie
    res.cookie(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "strict" : "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return sendSuccess(
      res,
      {
        customer: serializeCustomer(customer),
      },
      200,
      "Logged in successfully"
    );
  }
);

export const handleCustomerLogout = asyncHandler(
  async (_req: Request, res: Response) => {
    res.clearCookie(CUSTOMER_COOKIE_NAME, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "strict" : "lax",
      path: "/",
    });
    return sendSuccess(res, null, 200, "Logged out successfully");
  }
);

export const handleGetCustomerMe = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.customer) {
      throw new AppError("Not authenticated", 401);
    }

    const customer = await Customer.findById(req.customer.customerId).select(
      "-passwordHash"
    );

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    return sendSuccess(
      res,
      { customer: serializeCustomer(customer) },
      200
    );
  }
);

export const handleUpdateCustomerProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Not authenticated", 401);

    const allowedFields = new Set([
      "name",
      "email",
      "dateOfBirth",
      "birthdayOffersEnabled",
    ]);
    const suppliedFields = Object.keys(req.body ?? {});
    const unsupported = suppliedFields.filter((field) => !allowedFields.has(field));
    if (unsupported.length > 0) {
      throw new AppError(`Unsupported profile field: ${unsupported[0]}`, 400);
    }
    if (suppliedFields.length === 0) {
      throw new AppError("Provide at least one profile field to update", 400);
    }

    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        throw new AppError("Name is required", 400);
      }
      const name = req.body.name.trim();
      if (name.length > 120) throw new AppError("Name is too long", 400);
      customer.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
      const email = validateEmail(req.body.email);
      if (email) {
        const duplicate = await Customer.exists({
          _id: { $ne: customer._id },
          email,
        });
        if (duplicate) throw new AppError("Email already registered", 409);
      }
      customer.email = email;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "birthdayOffersEnabled")) {
      if (typeof req.body.birthdayOffersEnabled !== "boolean") {
        throw new AppError("Birthday offer preference must be true or false", 400);
      }
      customer.birthdayOffersEnabled = req.body.birthdayOffersEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "dateOfBirth")) {
      const now = new Date();
      const nextBirthday = parseStrictDateOnly(req.body.dateOfBirth);
      assertDateIsNotFuture(nextBirthday, now, APP_TIMEZONE);
      const change = canChangeBirthday(
        customer.dateOfBirth,
        nextBirthday,
        customer.birthdayUpdatedAt,
        now,
      );
      if (change.changed) {
        customer.dateOfBirth = nextBirthday;
        customer.birthdayUpdatedAt = change.nextUpdatedAt;
      }
    }

    if (customer.birthdayOffersEnabled && !customer.dateOfBirth) {
      throw new AppError("Add your birthday before enabling birthday offers", 400);
    }

    await customer.save();
    return sendSuccess(
      res,
      { customer: serializeCustomer(customer) },
      200,
      "Profile updated successfully",
    );
  },
);

export const handleDismissBirthdayPrompt = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Not authenticated", 401);

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { birthdayPromptDismissedAt: new Date() },
      { new: true },
    );
    if (!customer) throw new AppError("Customer not found", 404);

    return sendSuccess(
      res,
      { customer: serializeCustomer(customer) },
      200,
      "Birthday reminder dismissed",
    );
  },
);
