import crypto from "node:crypto";
import mongoose, { FilterQuery } from "mongoose";

import { Deal, DealType, DiscountType, IDeal } from "../models/Deal.js";
import {
  CouponStatus,
  IIssuedCoupon,
  IssuedCoupon,
} from "../models/IssuedCoupon.js";
import { Order } from "../models/Order.js";
import { AppError } from "../utils/appError.js";

export const DEAL_TYPES: DealType[] = ["GENERAL", "BIRTHDAY"];
export const DISCOUNT_TYPES: DiscountType[] = ["PERCENTAGE", "FIXED_AMOUNT"];
export const COUPON_STATUSES: CouponStatus[] = [
  "ACTIVE",
  "USED",
  "EXPIRED",
  "REVOKED",
];

export interface ICreateDealInput {
  name: string;
  description?: string;
  type: DealType;
  couponCodePrefix: string;
  discountType: DiscountType;
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscountAmount?: number;
  validFrom: Date | string;
  validUntil: Date | string;
  birthdayValidityDays?: number;
  usageLimit?: number;
  usageLimitPerUser?: number;
  isActive?: boolean;
  notificationTitle?: string;
  notificationMessage?: string;
  createdBy?: string;
}

export type IUpdateDealInput = Partial<Omit<ICreateDealInput, "createdBy">>;

function stringValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(`${field} is required`, 400);
  }
  const result = value.trim();
  if (result.length > maxLength) throw new AppError(`${field} is too long`, 400);
  return result;
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return stringValue(value, field, maxLength);
}

function finiteNumber(
  value: unknown,
  field: string,
  options: { optional?: boolean; integer?: boolean; min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined || value === null || value === "") {
    if (options.optional) return undefined;
    throw new AppError(`${field} is required`, 400);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || (options.integer && !Number.isInteger(number))) {
    throw new AppError(`${field} must be a valid${options.integer ? " whole" : ""} number`, 400);
  }
  if (options.min !== undefined && number < options.min) {
    throw new AppError(`${field} must be at least ${options.min}`, 400);
  }
  if (options.max !== undefined && number > options.max) {
    throw new AppError(`${field} must be at most ${options.max}`, 400);
  }
  return number;
}

function dealDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new AppError(`${field} must be a valid date`, 400);
  return date;
}

function normalizePrefix(value: unknown): string {
  const prefix = stringValue(value, "Coupon prefix", 24).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(prefix)) {
    throw new AppError(
      "Coupon prefix must be 3-24 characters using letters, numbers, hyphens, or underscores",
      400,
    );
  }
  return prefix;
}

export interface ValidatedDealFields {
  name: string;
  description?: string;
  type: DealType;
  couponCodePrefix: string;
  discountType: DiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  maximumDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  birthdayValidityDays?: number;
  usageLimit?: number;
  usageLimitPerUser: number;
  isActive: boolean;
  notificationTitle?: string;
  notificationMessage?: string;
}

export function validateDealFields(input: ICreateDealInput): ValidatedDealFields {
  const type = input.type;
  if (!DEAL_TYPES.includes(type)) throw new AppError("Invalid deal type", 400);
  const discountType = input.discountType;
  if (!DISCOUNT_TYPES.includes(discountType)) {
    throw new AppError("Invalid discount type", 400);
  }

  const discountValue = finiteNumber(input.discountValue, "Discount value", {
    min: 0.01,
    max: discountType === "PERCENTAGE" ? 100 : undefined,
  })!;
  const minimumOrderAmount = finiteNumber(
    input.minimumOrderAmount ?? 0,
    "Minimum order amount",
    { min: 0 },
  )!;
  const maximumDiscountAmount = finiteNumber(
    input.maximumDiscountAmount,
    "Maximum discount amount",
    { optional: true, min: 0.01 },
  );
  const validFrom = dealDate(input.validFrom, "Valid from");
  const validUntil = dealDate(input.validUntil, "Valid until");
  if (validFrom.getTime() >= validUntil.getTime()) {
    throw new AppError("Valid from date must be before valid until date", 400);
  }
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    throw new AppError("Active status must be true or false", 400);
  }

  const birthdayValidityDays =
    type === "BIRTHDAY"
      ? finiteNumber(input.birthdayValidityDays, "Birthday validity days", {
          integer: true,
          min: 1,
          max: 365,
        })
      : undefined;

  return {
    name: stringValue(input.name, "Deal name", 160),
    description: optionalString(input.description, "Description", 2000),
    type,
    couponCodePrefix: normalizePrefix(input.couponCodePrefix),
    discountType,
    discountValue,
    minimumOrderAmount,
    maximumDiscountAmount,
    validFrom,
    validUntil,
    birthdayValidityDays,
    usageLimit: finiteNumber(input.usageLimit, "Usage limit", {
      optional: true,
      integer: true,
      min: 1,
    }),
    usageLimitPerUser: finiteNumber(
      input.usageLimitPerUser ?? 1,
      "Usage per customer",
      { integer: true, min: 1, max: 100 },
    )!,
    isActive: input.isActive ?? true,
    notificationTitle: optionalString(input.notificationTitle, "Notification title", 180),
    notificationMessage: optionalString(
      input.notificationMessage,
      "Notification message",
      2000,
    ),
  };
}

async function assertGeneralPrefixAvailable(
  prefix: string,
  excludedId?: mongoose.Types.ObjectId,
): Promise<void> {
  const query: FilterQuery<IDeal> = { type: "GENERAL", couponCodePrefix: prefix };
  if (excludedId) query._id = { $ne: excludedId };
  const [conflictingDeal, conflictingPersonalizedCoupon] = await Promise.all([
    Deal.exists(query),
    // Older personalized rows predate the flag, so missing means personalized.
    IssuedCoupon.exists({ code: prefix, isPersonalized: { $ne: false } }),
  ]);
  if (conflictingDeal || conflictingPersonalizedCoupon) {
    throw new AppError("That general coupon code is already in use", 409);
  }
}

export async function createDeal(input: ICreateDealInput) {
  const fields = validateDealFields(input);
  if (fields.type === "GENERAL") {
    await assertGeneralPrefixAvailable(fields.couponCodePrefix);
  }

  if (input.createdBy && !mongoose.Types.ObjectId.isValid(input.createdBy)) {
    throw new AppError("Invalid administrator ID", 400);
  }

  return Deal.create({
    ...fields,
    createdBy: input.createdBy
      ? new mongoose.Types.ObjectId(input.createdBy)
      : undefined,
    redemptionCount: 0,
  });
}

function assertObjectId(id: string, label = "Deal"): void {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label.toLowerCase()} ID`, 400);
  }
}

export async function getDealById(id: string) {
  assertObjectId(id);
  const deal = await Deal.findById(id);
  if (!deal) throw new AppError("Deal not found", 404);
  return deal;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getDeals(options: {
  type?: DealType;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { type, isActive, search } = options;
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const query: FilterQuery<IDeal> = {};
  if (type) query.type = type;
  if (isActive !== undefined) query.isActive = isActive;
  if (search?.trim()) {
    const term = escapeRegExp(search.trim().slice(0, 120));
    query.$or = [
      { name: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
      { couponCodePrefix: { $regex: term, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const [deals, total] = await Promise.all([
    Deal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Deal.countDocuments(query),
  ]);
  const ids = deals.map((deal) => deal._id);
  const usage = ids.length
    ? await IssuedCoupon.aggregate<{
        _id: mongoose.Types.ObjectId;
        issued: number;
        used: number;
      }>([
        { $match: { dealId: { $in: ids } } },
        {
          $group: {
            _id: "$dealId",
            issued: { $sum: 1 },
            used: { $sum: { $cond: [{ $eq: ["$status", "USED"] }, 1, 0] } },
          },
        },
      ])
    : [];
  const usageByDeal = new Map(usage.map((entry) => [entry._id.toString(), entry]));

  return {
    deals: deals.map((deal) => ({
      ...deal,
      usage: usageByDeal.get(deal._id.toString()) ?? { issued: 0, used: 0 },
      usageCount: usageByDeal.get(deal._id.toString())?.used ?? 0,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function updateDeal(id: string, input: IUpdateDealInput) {
  assertObjectId(id);
  const deal = await Deal.findById(id);
  if (!deal) throw new AppError("Deal not found", 404);

  const allowed = new Set([
    "name",
    "description",
    "type",
    "couponCodePrefix",
    "discountType",
    "discountValue",
    "minimumOrderAmount",
    "maximumDiscountAmount",
    "validFrom",
    "validUntil",
    "birthdayValidityDays",
    "usageLimit",
    "usageLimitPerUser",
    "isActive",
    "notificationTitle",
    "notificationMessage",
  ]);
  const unsupported = Object.keys(input).find((key) => !allowed.has(key));
  if (unsupported) throw new AppError(`Unsupported deal field: ${unsupported}`, 400);
  if (Object.keys(input).length === 0) throw new AppError("No deal changes supplied", 400);

  if (input.type && input.type !== deal.type) {
    const hasIssuedCoupons = await IssuedCoupon.exists({ dealId: deal._id });
    if (hasIssuedCoupons) {
      throw new AppError("Deal type cannot be changed after coupons have been issued", 409);
    }
  }

  const merged = validateDealFields({
    name: input.name ?? deal.name,
    description: input.description === undefined ? deal.description : input.description,
    type: input.type ?? deal.type,
    couponCodePrefix: input.couponCodePrefix ?? deal.couponCodePrefix,
    discountType: input.discountType ?? deal.discountType,
    discountValue: input.discountValue ?? deal.discountValue,
    minimumOrderAmount:
      input.minimumOrderAmount === undefined
        ? deal.minimumOrderAmount
        : input.minimumOrderAmount,
    maximumDiscountAmount:
      input.maximumDiscountAmount === undefined
        ? deal.maximumDiscountAmount
        : input.maximumDiscountAmount,
    validFrom: input.validFrom ?? deal.validFrom,
    validUntil: input.validUntil ?? deal.validUntil,
    birthdayValidityDays:
      input.birthdayValidityDays === undefined
        ? deal.birthdayValidityDays
        : input.birthdayValidityDays,
    usageLimit: input.usageLimit === undefined ? deal.usageLimit : input.usageLimit,
    usageLimitPerUser:
      input.usageLimitPerUser === undefined
        ? deal.usageLimitPerUser
        : input.usageLimitPerUser,
    isActive: input.isActive === undefined ? deal.isActive : input.isActive,
    notificationTitle:
      input.notificationTitle === undefined
        ? deal.notificationTitle
        : input.notificationTitle,
    notificationMessage:
      input.notificationMessage === undefined
        ? deal.notificationMessage
        : input.notificationMessage,
  });

  if (merged.type === "GENERAL") {
    await assertGeneralPrefixAvailable(
      merged.couponCodePrefix,
      deal._id as mongoose.Types.ObjectId,
    );
  }
  Object.assign(deal, merged);
  return deal.save();
}

export async function deleteDeal(id: string) {
  const deal = await getDealById(id);
  const issuedCount = await IssuedCoupon.countDocuments({ dealId: deal._id });
  if (issuedCount > 0 || (deal.redemptionCount ?? 0) > 0) {
    deal.isActive = false;
    await deal.save();
    return { archived: true, deal };
  }
  await deal.deleteOne();
  return { archived: false, message: "Deal deleted successfully" };
}

export async function getDealAnalytics(dealId: string) {
  const deal = await getDealById(dealId);
  await refreshExpiredCoupons(deal._id as mongoose.Types.ObjectId);

  const [couponCounts, orderMetrics] = await Promise.all([
    IssuedCoupon.aggregate<{ _id: CouponStatus; count: number }>([
      { $match: { dealId: deal._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Order.aggregate<{
      _id: null;
      couponOrders: number;
      revenueFromCouponOrders: number;
      totalDiscountGiven: number;
    }>([
      { $match: { dealId: deal._id, orderStatus: { $ne: "CANCELLED" } } },
      {
        $group: {
          _id: null,
          couponOrders: { $sum: 1 },
          revenueFromCouponOrders: { $sum: "$totalAmount" },
          totalDiscountGiven: { $sum: { $ifNull: ["$couponDiscountAmount", 0] } },
        },
      },
    ]),
  ]);
  const counts = new Map(couponCounts.map((entry) => [entry._id, entry.count]));
  const issued = couponCounts.reduce((sum, entry) => sum + entry.count, 0);
  const used = counts.get("USED") ?? 0;
  const expired = counts.get("EXPIRED") ?? 0;
  const active = counts.get("ACTIVE") ?? 0;
  const revoked = counts.get("REVOKED") ?? 0;
  const metrics = orderMetrics[0] ?? {
    couponOrders: 0,
    revenueFromCouponOrders: 0,
    totalDiscountGiven: 0,
  };

  return {
    deal,
    coupons: { issued, used, unused: active, active, expired, revoked },
    orders: {
      ...metrics,
      revenue: metrics.revenueFromCouponOrders,
      totalDiscount: metrics.totalDiscountGiven,
    },
  };
}

export async function getDealIssuedCoupons(
  dealId: string,
  options: { status?: CouponStatus; page?: number; limit?: number },
) {
  const deal = await getDealById(dealId);
  await refreshExpiredCoupons(deal._id as mongoose.Types.ObjectId);
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const query: FilterQuery<IIssuedCoupon> = { dealId: deal._id };
  if (options.status) query.status = options.status;
  const skip = (page - 1) * limit;
  const [coupons, total] = await Promise.all([
    IssuedCoupon.find(query)
      .populate("userId", "name phone email")
      .populate("usedOrderId", "orderNumber totalAmount")
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limit),
    IssuedCoupon.countDocuments(query),
  ]);
  return { coupons, total, page, pages: Math.ceil(total / limit) };
}

export function generateUniqueCouponCode(prefix: string): string {
  const suffix = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${normalizePrefix(prefix)}-${suffix}`;
}

async function refreshExpiredCoupons(dealId: mongoose.Types.ObjectId): Promise<void> {
  await IssuedCoupon.updateMany(
    { dealId, status: "ACTIVE", expiresAt: { $lt: new Date() } },
    { $set: { status: "EXPIRED" } },
  );
}
