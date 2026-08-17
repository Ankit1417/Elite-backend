import mongoose, { ClientSession, FilterQuery } from "mongoose";

import { Deal, DiscountType, IDeal } from "../models/Deal.js";
import { DealUsage } from "../models/DealUsage.js";
import {
  CouponStatus,
  IIssuedCoupon,
  IssuedCoupon,
} from "../models/IssuedCoupon.js";
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/appError.js";
import { generateUniqueCouponCode } from "./dealService.js";
import { CartItemInput, priceCartItems } from "./cartPricingService.js";

export interface IIssueCouponInput {
  dealId: string;
  userId: string;
  birthdayYear?: number;
}

export interface IValidateCouponInput {
  code: string;
  userId?: string;
  orderAmount: number;
}

export interface IRedeemCouponInput {
  code: string;
  userId: string;
  orderId: string;
  orderAmount: number;
}

export interface CouponRedemption {
  couponId: mongoose.Types.ObjectId;
  dealId: mongoose.Types.ObjectId;
  code: string;
  discountAmount: number;
  isPersonalized: boolean;
  usageScopeKey: string;
  userId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
}

interface ResolvedCoupon {
  deal: IDeal;
  issuedCoupon?: IIssuedCoupon;
  code: string;
  isPersonalized: boolean;
  discountType: DiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  maximumDiscountAmount?: number;
  validFrom: Date;
  expiresAt: Date;
  usageScopeKey: string;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCouponCode(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("Coupon code is required", 400);
  }
  const code = value.trim().toUpperCase();
  if (code.length > 64 || !/^[A-Z0-9_-]+$/.test(code)) {
    throw new AppError("Invalid coupon code", 400);
  }
  return code;
}

export function assertDealRedeemable(deal: Pick<IDeal, "isActive" | "validFrom" | "validUntil">, now: Date): void {
  if (!deal.isActive) throw new AppError("This deal is currently disabled", 400);
  if (now < deal.validFrom) throw new AppError("This deal has not started yet", 400);
  if (now > deal.validUntil) throw new AppError("This deal has expired", 400);
}

export function calculateCouponDiscount(
  orderAmount: number,
  discountType: DiscountType,
  discountValue: number,
  maximumDiscountAmount?: number,
): number {
  if (!Number.isFinite(orderAmount) || orderAmount < 0) {
    throw new AppError("Order amount must be a non-negative number", 400);
  }
  let discount =
    discountType === "PERCENTAGE"
      ? (orderAmount * discountValue) / 100
      : discountValue;
  if (maximumDiscountAmount !== undefined) {
    discount = Math.min(discount, maximumDiscountAmount);
  }
  return money(Math.max(0, Math.min(discount, orderAmount)));
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000,
  );
}

function withSession<T extends { session(session: ClientSession): T }>(
  query: T,
  session?: ClientSession,
): T {
  return session ? query.session(session) : query;
}

function usageScopeKey(deal: IDeal, coupon?: IIssuedCoupon): string {
  if (deal.type === "BIRTHDAY" && coupon?.birthdayYear) {
    return `birthday:${coupon.birthdayYear}`;
  }
  return "campaign";
}

async function getUsageCount(
  dealId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  scopeKey: string,
  session?: ClientSession,
): Promise<number> {
  const query = DealUsage.findOne({ dealId, userId, scopeKey });
  if (session) query.session(session);
  return (await query)?.count ?? 0;
}

async function resolveCoupon(
  codeInput: string,
  userId: string | undefined,
  now: Date,
  session?: ClientSession,
): Promise<ResolvedCoupon> {
  const code = normalizeCouponCode(codeInput);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError("Authentication is required to use a coupon", 401);
  }

  const issuedQuery = IssuedCoupon.findOne({
    code,
    isPersonalized: { $ne: false },
  }).populate("dealId");
  if (session) issuedQuery.session(session);
  const issuedCoupon = await issuedQuery;

  if (issuedCoupon) {
    const deal = issuedCoupon.dealId as unknown as IDeal;
    if (!deal) throw new AppError("Coupon campaign no longer exists", 400);
    assertDealRedeemable(deal, now);
    if (issuedCoupon.userId.toString() !== userId) {
      throw new AppError("This coupon is not valid for your account", 403);
    }
    if (issuedCoupon.status !== "ACTIVE") {
      throw new AppError(
        issuedCoupon.status === "USED" ? "Coupon has already been used" : "Coupon is no longer active",
        400,
      );
    }
    if (now < issuedCoupon.validFrom) throw new AppError("Coupon is not active yet", 400);
    if (now > issuedCoupon.expiresAt) {
      await IssuedCoupon.updateOne(
        { _id: issuedCoupon._id, status: "ACTIVE" },
        { $set: { status: "EXPIRED" } },
        session ? { session } : {},
      );
      throw new AppError("Coupon has expired", 400);
    }
    return {
      deal,
      issuedCoupon,
      code,
      isPersonalized: true,
      discountType: issuedCoupon.discountType,
      discountValue: issuedCoupon.discountValue,
      minimumOrderAmount: issuedCoupon.minimumOrderAmount,
      maximumDiscountAmount: issuedCoupon.maximumDiscountAmount,
      validFrom: issuedCoupon.validFrom,
      expiresAt: issuedCoupon.expiresAt,
      usageScopeKey: usageScopeKey(deal, issuedCoupon),
    };
  }

  const dealQuery = Deal.findOne({ type: "GENERAL", couponCodePrefix: code });
  if (session) dealQuery.session(session);
  const deal = await dealQuery;
  if (!deal) throw new AppError("Invalid coupon code", 404);
  assertDealRedeemable(deal, now);
  return {
    deal,
    code,
    isPersonalized: false,
    discountType: deal.discountType,
    discountValue: deal.discountValue,
    minimumOrderAmount: deal.minimumOrderAmount ?? 0,
    maximumDiscountAmount: deal.maximumDiscountAmount,
    validFrom: deal.validFrom,
    expiresAt: deal.validUntil,
    usageScopeKey: "campaign",
  };
}

export async function validateCoupon(
  input: IValidateCouponInput,
  options: { session?: ClientSession; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const resolved = await resolveCoupon(input.code, input.userId, now, options.session);
  const userObjectId = new mongoose.Types.ObjectId(input.userId!);
  const redemptionCount = resolved.deal.redemptionCount ?? 0;
  if (resolved.deal.usageLimit && redemptionCount >= resolved.deal.usageLimit) {
    throw new AppError("This deal has reached its usage limit", 400);
  }
  const userUsage = await getUsageCount(
    resolved.deal._id as mongoose.Types.ObjectId,
    userObjectId,
    resolved.usageScopeKey,
    options.session,
  );
  if (userUsage >= (resolved.deal.usageLimitPerUser ?? 1)) {
    throw new AppError("You have reached the usage limit for this deal", 400);
  }
  if (input.orderAmount < resolved.minimumOrderAmount) {
    throw new AppError(`Minimum order amount is Rs. ${resolved.minimumOrderAmount}`, 400);
  }

  const discountAmount = calculateCouponDiscount(
    input.orderAmount,
    resolved.discountType,
    resolved.discountValue,
    resolved.maximumDiscountAmount,
  );
  return {
    valid: true as const,
    coupon: {
      id: resolved.issuedCoupon?._id,
      code: resolved.code,
      dealId: resolved.deal._id,
      dealName: resolved.deal.name,
      dealType: resolved.deal.type,
      isPersonalized: resolved.isPersonalized,
      discountType: resolved.discountType,
      discountValue: resolved.discountValue,
      minimumOrderAmount: resolved.minimumOrderAmount,
      maximumDiscountAmount: resolved.maximumDiscountAmount,
      expiresAt: resolved.expiresAt,
      usageScopeKey: resolved.usageScopeKey,
    },
    discountAmount,
  };
}

async function claimDealUsage(deal: IDeal, now: Date, session?: ClientSession): Promise<void> {
  const query: FilterQuery<IDeal> = {
    _id: deal._id,
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  };
  if (deal.usageLimit) {
    query.$or = [
      { redemptionCount: { $lt: deal.usageLimit } },
      { redemptionCount: { $exists: false } },
    ];
  }
  const claimed = await Deal.findOneAndUpdate(
    query,
    { $inc: { redemptionCount: 1 } },
    { new: true, ...(session ? { session } : {}) },
  );
  if (!claimed) throw new AppError("This deal is no longer available", 409);
}

async function releaseDealUsage(dealId: mongoose.Types.ObjectId, session?: ClientSession) {
  await Deal.updateOne(
    { _id: dealId, redemptionCount: { $gt: 0 } },
    { $inc: { redemptionCount: -1 } },
    session ? { session } : {},
  );
}

async function claimUserUsage(
  dealId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  scopeKey: string,
  limit: number,
  session?: ClientSession,
): Promise<void> {
  const identity = { dealId, userId, scopeKey };
  try {
    const result = await DealUsage.findOneAndUpdate(
      {
        ...identity,
        $or: [{ count: { $lt: limit } }, { count: { $exists: false } }],
      },
      { $inc: { count: 1 }, $setOnInsert: identity },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: false,
        ...(session ? { session } : {}),
      },
    );
    if (result) return;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    if (session) {
      throw new AppError("Coupon usage changed during checkout. Please retry.", 409);
    }
  }

  const retry = await DealUsage.findOneAndUpdate(
    { ...identity, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { new: true, ...(session ? { session } : {}) },
  );
  if (!retry) throw new AppError("You have reached the usage limit for this deal", 409);
}

async function releaseUserUsage(
  dealId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  scopeKey: string,
  session?: ClientSession,
) {
  await DealUsage.updateOne(
    { dealId, userId, scopeKey, count: { $gt: 0 } },
    { $inc: { count: -1 } },
    session ? { session } : {},
  );
}

export async function redeemCoupon(
  input: IRedeemCouponInput,
  options: { session?: ClientSession; now?: Date } = {},
): Promise<CouponRedemption> {
  if (!mongoose.Types.ObjectId.isValid(input.orderId)) {
    throw new AppError("Invalid order ID", 400);
  }
  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    throw new AppError("Invalid customer ID", 400);
  }
  const now = options.now ?? new Date();
  const validation = await validateCoupon(input, options);
  const dealId = validation.coupon.dealId as mongoose.Types.ObjectId;
  const userId = new mongoose.Types.ObjectId(input.userId);
  const orderId = new mongoose.Types.ObjectId(input.orderId);
  const deal = await withSession(Deal.findById(dealId), options.session);
  if (!deal) throw new AppError("Deal not found", 404);

  await claimDealUsage(deal, now, options.session);
  try {
    await claimUserUsage(
      dealId,
      userId,
      validation.coupon.usageScopeKey,
      deal.usageLimitPerUser ?? 1,
      options.session,
    );
  } catch (error) {
    if (!options.session) await releaseDealUsage(dealId);
    throw error;
  }

  try {
    let coupon: IIssuedCoupon | null;
    if (validation.coupon.isPersonalized) {
      coupon = await IssuedCoupon.findOneAndUpdate(
        {
          _id: validation.coupon.id,
          userId,
          status: "ACTIVE",
          validFrom: { $lte: now },
          expiresAt: { $gte: now },
        },
        {
          $set: { status: "USED", usedAt: now, usedOrderId: orderId },
        },
        { new: true, ...(options.session ? { session: options.session } : {}) },
      );
      if (!coupon) throw new AppError("Coupon was already used or expired", 409);
    } else {
      coupon = null;
      for (let attempt = 0; attempt < 5 && !coupon; attempt += 1) {
        const generalCoupon = new IssuedCoupon({
          dealId,
          userId,
          code: generateUniqueCouponCode(deal.couponCodePrefix),
          sourceCode: validation.coupon.code,
          isPersonalized: false,
          discountType: validation.coupon.discountType,
          discountValue: validation.coupon.discountValue,
          minimumOrderAmount: validation.coupon.minimumOrderAmount,
          maximumDiscountAmount: validation.coupon.maximumDiscountAmount,
          issuedAt: now,
          validFrom: deal.validFrom,
          expiresAt: deal.validUntil,
          usedAt: now,
          usedOrderId: orderId,
          status: "USED",
        });
        try {
          coupon = await generalCoupon.save(
            options.session ? { session: options.session } : undefined,
          );
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
          if (options.session) {
            throw new AppError("Coupon reservation conflicted. Please retry.", 409);
          }
        }
      }
      if (!coupon) throw new AppError("Could not reserve this coupon. Please retry.", 503);
    }

    return {
      couponId: coupon._id as mongoose.Types.ObjectId,
      dealId,
      code: validation.coupon.code,
      discountAmount: validation.discountAmount,
      isPersonalized: validation.coupon.isPersonalized,
      usageScopeKey: validation.coupon.usageScopeKey,
      userId,
      orderId,
    };
  } catch (error) {
    if (!options.session) {
      await Promise.all([
        releaseDealUsage(dealId),
        releaseUserUsage(dealId, userId, validation.coupon.usageScopeKey),
      ]);
    }
    throw error;
  }
}

export async function releaseCouponRedemption(
  redemption: CouponRedemption,
  session?: ClientSession,
): Promise<void> {
  let released = false;
  if (redemption.isPersonalized) {
    const result = await IssuedCoupon.updateOne(
      {
        _id: redemption.couponId,
        usedOrderId: redemption.orderId,
        status: "USED",
      },
      {
        $set: { status: "ACTIVE" },
        $unset: { usedAt: 1, usedOrderId: 1 },
      },
      session ? { session } : {},
    );
    released = result.modifiedCount === 1;
  } else {
    const result = await IssuedCoupon.deleteOne(
      { _id: redemption.couponId, usedOrderId: redemption.orderId },
      session ? { session } : {},
    );
    released = result.deletedCount === 1;
  }
  if (!released) return;
  await Promise.all([
    releaseDealUsage(redemption.dealId, session),
    releaseUserUsage(
      redemption.dealId,
      redemption.userId,
      redemption.usageScopeKey,
      session,
    ),
  ]);
}

async function buildIssuedCoupon(
  input: IIssueCouponInput,
  now: Date,
): Promise<IIssuedCoupon> {
  if (!mongoose.Types.ObjectId.isValid(input.dealId)) throw new AppError("Invalid deal ID", 400);
  if (!mongoose.Types.ObjectId.isValid(input.userId)) throw new AppError("Invalid customer ID", 400);
  const [deal, user] = await Promise.all([
    Deal.findById(input.dealId),
    Customer.findById(input.userId),
  ]);
  if (!deal) throw new AppError("Deal not found", 404);
  if (!user || !user.isActive) throw new AppError("Customer not found", 404);
  assertDealRedeemable(deal, now);
  if (deal.type === "BIRTHDAY" && !input.birthdayYear) {
    throw new AppError("Birthday year is required for birthday rewards", 400);
  }

  let validFrom = deal.validFrom;
  let expiresAt = deal.validUntil;
  if (deal.type === "BIRTHDAY") {
    validFrom = now;
    const requestedExpiry = new Date(
      now.getTime() + (deal.birthdayValidityDays ?? 1) * 24 * 60 * 60 * 1000,
    );
    expiresAt = new Date(Math.min(requestedExpiry.getTime(), deal.validUntil.getTime()));
  }
  if (expiresAt <= validFrom) throw new AppError("Birthday reward has no remaining validity", 400);

  return new IssuedCoupon({
    dealId: deal._id,
    userId: user._id,
    code: generateUniqueCouponCode(deal.couponCodePrefix),
    isPersonalized: true,
    discountType: deal.discountType,
    discountValue: deal.discountValue,
    minimumOrderAmount: deal.minimumOrderAmount ?? 0,
    maximumDiscountAmount: deal.maximumDiscountAmount,
    issuedAt: now,
    validFrom,
    expiresAt,
    status: "ACTIVE",
    birthdayYear: input.birthdayYear,
  });
}

export async function ensureBirthdayCoupon(
  input: IIssueCouponInput,
  now = new Date(),
): Promise<{ coupon: IIssuedCoupon; created: boolean }> {
  if (!input.birthdayYear) throw new AppError("Birthday year is required", 400);
  if (!mongoose.Types.ObjectId.isValid(input.dealId)) throw new AppError("Invalid deal ID", 400);
  if (!mongoose.Types.ObjectId.isValid(input.userId)) throw new AppError("Invalid customer ID", 400);
  const identity = {
    dealId: new mongoose.Types.ObjectId(input.dealId),
    userId: new mongoose.Types.ObjectId(input.userId),
    birthdayYear: input.birthdayYear,
  };
  const existing = await IssuedCoupon.findOne(identity);
  if (existing) return { coupon: existing, created: false };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const coupon = await buildIssuedCoupon(input, now);
    try {
      await coupon.save();
      return { coupon, created: true };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const concurrentlyIssued = await IssuedCoupon.findOne(identity);
      if (concurrentlyIssued) return { coupon: concurrentlyIssued, created: false };
    }
  }
  throw new AppError("Could not generate a unique coupon code. Please retry.", 503);
}

export async function issueCoupon(input: IIssueCouponInput) {
  if (input.birthdayYear) return (await ensureBirthdayCoupon(input)).coupon;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const coupon = await buildIssuedCoupon(input, new Date());
    try {
      return await coupon.save();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new AppError("Could not generate a unique coupon code. Please retry.", 503);
}

export async function validateCouponForCart(input: {
  code: string;
  userId: string;
  items: CartItemInput[];
}) {
  const pricing = await priceCartItems(input.items);
  const validation = await validateCoupon({
    code: input.code,
    userId: input.userId,
    orderAmount: pricing.merchandiseAmount,
  });
  return {
    ...validation,
    subtotal: pricing.subtotal,
    itemDiscountAmount: pricing.itemDiscountAmount,
    merchandiseAmount: pricing.merchandiseAmount,
    totalAfterCoupon: money(pricing.merchandiseAmount - validation.discountAmount),
    dealName: validation.coupon.dealName,
    dealId: validation.coupon.dealId,
    couponCode: validation.coupon.code,
    discountType: validation.coupon.discountType,
    discountValue: validation.coupon.discountValue,
    expiresAt: validation.coupon.expiresAt,
  };
}

export async function getUserCoupons(
  userId: string,
  options: { status?: CouponStatus; page?: number; limit?: number },
) {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new AppError("Invalid customer ID", 400);
  await expireOldCoupons({ userId: new mongoose.Types.ObjectId(userId) });
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const query: FilterQuery<IIssuedCoupon> = {
    userId: new mongoose.Types.ObjectId(userId),
  };
  if (options.status) query.status = options.status;
  const skip = (page - 1) * limit;
  const [coupons, total] = await Promise.all([
    IssuedCoupon.find(query)
      .populate("dealId", "name type discountType discountValue")
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limit),
    IssuedCoupon.countDocuments(query),
  ]);
  return { coupons, total, page, pages: Math.ceil(total / limit) };
}

export async function expireOldCoupons(
  scope: { userId?: mongoose.Types.ObjectId; dealId?: mongoose.Types.ObjectId } = {},
) {
  const result = await IssuedCoupon.updateMany(
    { ...scope, status: "ACTIVE", expiresAt: { $lt: new Date() } },
    { $set: { status: "EXPIRED" } },
  );
  return { expired: result.modifiedCount };
}
