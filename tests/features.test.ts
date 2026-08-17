import assert from "node:assert/strict";
import test from "node:test";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { handleUpdateCustomerProfile } from "../src/controllers/customerAuthController.js";
import { JWT_SECRET } from "../src/config/env.js";
import { protectAdmin } from "../src/middleware/authMiddleware.js";
import { Customer } from "../src/models/Customer.js";
import { Deal } from "../src/models/Deal.js";
import { DealUsage } from "../src/models/DealUsage.js";
import { IssuedCoupon } from "../src/models/IssuedCoupon.js";
import { Notification } from "../src/models/Notification.js";
import { Order } from "../src/models/Order.js";
import {
  millisecondsUntilNextBirthdayRun,
  processBirthdayRewards,
} from "../src/services/birthdaySchedulerService.js";
import {
  createDeal,
  generateUniqueCouponCode,
  validateDealFields,
} from "../src/services/dealService.js";
import {
  assertDealRedeemable,
  calculateCouponDiscount,
  ensureBirthdayCoupon,
  normalizeCouponCode,
  redeemCoupon,
  validateCoupon,
} from "../src/services/issuedCouponService.js";
import {
  createBirthdayRewardNotification,
  getUnreadCount,
  getUserNotifications,
  markAllAsRead,
  markAsRead,
  renderNotificationTemplate,
} from "../src/services/notificationService.js";
import {
  getOrderNotificationDescriptor,
  updateOrderStatus,
} from "../src/services/orderService.js";
import {
  assertDateIsNotFuture,
  canChangeBirthday,
  getDatePartsInTimezone,
  isBirthdayOnDate,
  isLeapYear,
  parseStrictDateOnly,
} from "../src/utils/businessDate.js";
import { AppError } from "../src/utils/appError.js";

type AnyFunction = (...args: any[]) => any;

function replaceMethod(
  target: Record<string, any>,
  key: string,
  replacement: AnyFunction,
): () => void {
  const hadOwnProperty = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = replacement;
  return () => {
    if (hadOwnProperty) target[key] = original;
    else delete target[key];
  };
}

async function withReplacements<T>(
  replacements: Array<[
    Record<string, any>,
    string,
    AnyFunction,
  ]>,
  operation: () => Promise<T>,
): Promise<T> {
  const restores = replacements.map(([target, key, replacement]) =>
    replaceMethod(target, key, replacement),
  );
  try {
    return await operation();
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
}

function expectAppError(
  error: unknown,
  statusCode: number,
  message: RegExp,
): boolean {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, statusCode);
  assert.match(error.message, message);
  return true;
}

function baseDeal(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: "Birthday Special",
    description: "A birthday reward",
    type: "BIRTHDAY",
    couponCodePrefix: "BDAY20",
    discountType: "PERCENTAGE",
    discountValue: 20,
    minimumOrderAmount: 1_000,
    maximumDiscountAmount: 1_500,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T23:59:59.999Z"),
    birthdayValidityDays: 7,
    usageLimit: 1_000,
    usageLimitPerUser: 1,
    isActive: true,
    redemptionCount: 0,
    ...overrides,
  } as any;
}

function personalizedCoupon(
  deal: ReturnType<typeof baseDeal>,
  userId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: new mongoose.Types.ObjectId(),
    dealId: deal,
    userId,
    code: "BDAY20-A7K92P",
    isPersonalized: true,
    discountType: deal.discountType,
    discountValue: deal.discountValue,
    minimumOrderAmount: deal.minimumOrderAmount,
    maximumDiscountAmount: deal.maximumDiscountAmount,
    issuedAt: new Date("2026-08-17T00:00:00.000Z"),
    validFrom: new Date("2026-08-17T00:00:00.000Z"),
    expiresAt: new Date("2026-08-24T23:59:59.999Z"),
    status: "ACTIVE",
    birthdayYear: 2026,
    ...overrides,
  } as any;
}

function populatedCouponQuery(value: unknown) {
  return {
    populate: () => Promise.resolve(value),
  };
}

function findNamedIndex(model: { schema: mongoose.Schema }, name: string) {
  return model.schema.indexes().find(([, options]) => options.name === name);
}

function captureHandlerError(handler: AnyFunction, request: Record<string, unknown>) {
  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Expected middleware to forward an error")),
      1_000,
    );
    handler(request, {}, (error: unknown) => {
      clearTimeout(timeout);
      resolve(error);
    });
  });
}

test("birthday deal validation normalizes a production campaign", () => {
  const fields = validateDealFields({
    name: "  Birthday Special  ",
    description: "  Annual reader reward  ",
    type: "BIRTHDAY",
    couponCodePrefix: " bday20 ",
    discountType: "PERCENTAGE",
    discountValue: 20,
    minimumOrderAmount: 1_000,
    maximumDiscountAmount: 1_500,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-12-31T23:59:59.999Z",
    birthdayValidityDays: 7,
    usageLimit: 500,
    usageLimitPerUser: 1,
    notificationTitle: " Happy Birthday, {firstName}! ",
    notificationMessage: " Use {couponCode}. ",
  });

  assert.equal(fields.name, "Birthday Special");
  assert.equal(fields.description, "Annual reader reward");
  assert.equal(fields.couponCodePrefix, "BDAY20");
  assert.equal(fields.birthdayValidityDays, 7);
  assert.equal(fields.usageLimitPerUser, 1);
  assert.equal(fields.isActive, true);
  assert.equal(fields.validFrom.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("creating a birthday deal passes validated fields to Mongoose", async () => {
  const adminId = new mongoose.Types.ObjectId().toString();
  let persisted: Record<string, unknown> | undefined;

  await withReplacements(
    [
      [Deal as any, "create", async (document: Record<string, unknown>) => {
        persisted = document;
        return document;
      }],
    ],
    async () => {
      await createDeal({
        name: "Birthday Special",
        type: "BIRTHDAY",
        couponCodePrefix: "bday20",
        discountType: "PERCENTAGE",
        discountValue: 20,
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2026-12-31T23:59:59.999Z",
        birthdayValidityDays: 7,
        createdBy: adminId,
      });
    },
  );

  assert.ok(persisted);
  assert.equal(persisted.couponCodePrefix, "BDAY20");
  assert.equal(persisted.redemptionCount, 0);
  assert.equal((persisted.createdBy as mongoose.Types.ObjectId).toString(), adminId);
});

test("birthday deal validation rejects missing validity and invalid economics", () => {
  const input = {
    name: "Birthday Special",
    type: "BIRTHDAY" as const,
    couponCodePrefix: "BDAY20",
    discountType: "PERCENTAGE" as const,
    discountValue: 20,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-12-31T23:59:59.999Z",
  };

  assert.throws(
    () => validateDealFields(input),
    (error) => expectAppError(error, 400, /Birthday validity days is required/),
  );
  assert.throws(
    () => validateDealFields({ ...input, birthdayValidityDays: 7, discountValue: 101 }),
    (error) => expectAppError(error, 400, /at most 100/),
  );
  assert.throws(
    () =>
      validateDealFields({
        ...input,
        birthdayValidityDays: 7,
        validFrom: "2027-01-01",
        validUntil: "2026-01-01",
      }),
    (error) => expectAppError(error, 400, /before valid until/),
  );
});

test("customer authentication cookie cannot pass the admin guard", () => {
  let forwarded: unknown;
  protectAdmin(
    {
      cookies: { customer_token: "a-customer-session" },
      headers: {},
    } as any,
    {} as any,
    ((error?: unknown) => {
      forwarded = error;
    }) as any,
  );

  expectAppError(forwarded, 401, /Admin authentication required/);
});

test("signed customer Bearer token is rejected by the admin guard", () => {
  const customerId = new mongoose.Types.ObjectId().toString();
  const token = jwt.sign(
    { role: "customer", customerId, phone: "9800000099" },
    JWT_SECRET,
    { expiresIn: "5m" },
  );
  const request: Record<string, any> = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
  };
  let forwarded: unknown;

  protectAdmin(
    request as any,
    {} as any,
    ((error?: unknown) => {
      forwarded = error;
    }) as any,
  );

  expectAppError(forwarded, 401, /Admin authentication required/);
  assert.equal(request.admin, undefined);
});

test("signed admin Bearer token is accepted and attaches validated claims", () => {
  const adminId = new mongoose.Types.ObjectId().toString();
  const token = jwt.sign(
    { role: "admin", adminId, email: "admin@elitelibrary.com" },
    JWT_SECRET,
    { expiresIn: "5m" },
  );
  const request: Record<string, any> = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
  };
  let nextCalls = 0;
  let forwarded: unknown = Symbol("not-called");

  protectAdmin(
    request as any,
    {} as any,
    ((error?: unknown) => {
      nextCalls += 1;
      forwarded = error;
    }) as any,
  );

  assert.equal(nextCalls, 1);
  assert.equal(forwarded, undefined);
  assert.deepEqual(request.admin, {
    role: "admin",
    adminId,
    email: "admin@elitelibrary.com",
  });
});

test("strict birthday parsing accepts real calendar dates only", () => {
  assert.equal(parseStrictDateOnly("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.throws(
    () => parseStrictDateOnly("2023-02-29"),
    (error) => expectAppError(error, 400, /valid birthday/),
  );
  assert.throws(
    () => parseStrictDateOnly("02/29/2024"),
    (error) => expectAppError(error, 400, /YYYY-MM-DD/),
  );
  assert.throws(
    () => parseStrictDateOnly("1899-12-31"),
    (error) => expectAppError(error, 400, /valid birthday/),
  );
});

test("future birthday validation uses the Nepal business date", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  assert.doesNotThrow(() =>
    assertDateIsNotFuture(parseStrictDateOnly("2026-08-17"), now, "Asia/Kathmandu"),
  );
  assert.throws(
    () => assertDateIsNotFuture(parseStrictDateOnly("2026-08-18"), now, "Asia/Kathmandu"),
    (error) => expectAppError(error, 400, /cannot be in the future/),
  );
});

test("birthday cooldown blocks changes for 365 days but permits no-op corrections", () => {
  const previous = parseStrictDateOnly("1990-04-05");
  const changed = parseStrictDateOnly("1990-04-06");
  const lastUpdate = new Date("2026-01-01T00:00:00.000Z");

  assert.deepEqual(
    canChangeBirthday(previous, previous, lastUpdate, new Date("2026-03-01T00:00:00.000Z")),
    { changed: false },
  );
  assert.throws(
    () => canChangeBirthday(previous, changed, lastUpdate, new Date("2026-12-31T00:00:00.000Z")),
    (error) => expectAppError(error, 409, /once every 365 days/),
  );
  const allowedAt = new Date("2027-01-01T00:00:00.000Z");
  assert.deepEqual(canChangeBirthday(previous, changed, lastUpdate, allowedAt), {
    changed: true,
    nextUpdatedAt: allowedAt,
  });
});

test("birthday offers default off and cannot be enabled without a birthday", async () => {
  const customer = new Customer({
    name: "Ankit Reader",
    phone: "9800000000",
    passwordHash: "not-a-real-password-hash",
  });
  assert.equal(customer.birthdayOffersEnabled, false);
  assert.equal(customer.validateSync(), undefined);

  let saved = false;
  const fakeCustomer = {
    _id: new mongoose.Types.ObjectId(),
    name: "Ankit Reader",
    phone: "9800000000",
    birthdayOffersEnabled: false,
    dateOfBirth: undefined,
    save: async () => {
      saved = true;
    },
  };

  const error = await withReplacements(
    [[Customer as any, "findById", async () => fakeCustomer]],
    () =>
      captureHandlerError(handleUpdateCustomerProfile, {
        customer: { customerId: fakeCustomer._id.toString() },
        body: { birthdayOffersEnabled: true },
      }),
  );
  expectAppError(error, 400, /Add your birthday before enabling birthday offers/);
  assert.equal(saved, false);
});

test("birthday matching centralizes the February 29 policy", () => {
  const leapBirthday = parseStrictDateOnly("2000-02-29");
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isBirthdayOnDate(leapBirthday, { year: 2026, month: 2, day: 28 }), true);
  assert.equal(isBirthdayOnDate(leapBirthday, { year: 2026, month: 3, day: 1 }), false);
  assert.equal(isBirthdayOnDate(leapBirthday, { year: 2024, month: 2, day: 28 }), false);
  assert.equal(isBirthdayOnDate(leapBirthday, { year: 2024, month: 2, day: 29 }), true);
  assert.equal(
    isBirthdayOnDate(parseStrictDateOnly("1995-08-17"), {
      year: 2026,
      month: 8,
      day: 17,
    }),
    true,
  );
});

test("Nepal date conversion and daily scheduler timing avoid naive UTC days", () => {
  const instant = new Date("2026-08-16T18:20:00.000Z");
  assert.deepEqual(getDatePartsInTimezone(instant, "Asia/Kathmandu"), {
    year: 2026,
    month: 8,
    day: 17,
  });
  assert.equal(
    millisecondsUntilNextBirthdayRun(
      new Date("2026-08-16T18:10:00.000Z"),
      "Asia/Kathmandu",
      0,
      5,
    ),
    10 * 60 * 1_000,
  );
});

test("scheduler customer selection requires birthday, opt-in, and active account", async () => {
  let customerFilter: Record<string, unknown> | undefined;
  const now = new Date("2026-08-17T00:00:00.000Z");

  const result = await withReplacements(
    [
      [IssuedCoupon as any, "updateMany", async () => ({ modifiedCount: 0 })],
      [Deal as any, "find", async () => [baseDeal()]],
      [Customer as any, "find", async (query: Record<string, unknown>) => {
        customerFilter = query;
        return [];
      }],
    ],
    () => processBirthdayRewards(now),
  );

  assert.deepEqual(result, { processed: 0, issued: 0, errors: 0 });
  assert.deepEqual(customerFilter, {
    dateOfBirth: { $exists: true, $ne: null },
    birthdayOffersEnabled: true,
    isActive: true,
  });
});

test("birthday issuance returns an existing campaign/year coupon on rerun", async () => {
  const dealId = new mongoose.Types.ObjectId().toString();
  const userId = new mongoose.Types.ObjectId().toString();
  const existing = { _id: new mongoose.Types.ObjectId(), code: "BDAY20-EXISTING" };
  let dealLookupCalled = false;

  const result = await withReplacements(
    [
      [IssuedCoupon as any, "findOne", async () => existing],
      [Deal as any, "findById", async () => {
        dealLookupCalled = true;
        throw new Error("should not build another coupon");
      }],
    ],
    () => ensureBirthdayCoupon({ dealId, userId, birthdayYear: 2026 }),
  );

  assert.equal(result.created, false);
  assert.equal(result.coupon, existing);
  assert.equal(dealLookupCalled, false);
});

test("birthday and usage indexes enforce idempotency without blocking general coupons", () => {
  const birthdayIndex = findNamedIndex(
    IssuedCoupon as unknown as { schema: mongoose.Schema },
    "unique_birthday_reward_per_year",
  );
  assert.ok(birthdayIndex);
  assert.deepEqual(birthdayIndex[0], { userId: 1, dealId: 1, birthdayYear: 1 });
  assert.equal(birthdayIndex[1].unique, true);
  assert.deepEqual(birthdayIndex[1].partialFilterExpression, {
    birthdayYear: { $type: "number" },
  });

  const usageIndex = findNamedIndex(
    DealUsage as unknown as { schema: mongoose.Schema },
    "unique_deal_user_usage_scope",
  );
  assert.ok(usageIndex);
  assert.deepEqual(usageIndex[0], { dealId: 1, userId: 1, scopeKey: 1 });
  assert.equal(usageIndex[1].unique, true);
});

test("coupon codes normalize safely and generated personalized codes are non-predictable", () => {
  assert.equal(normalizeCouponCode("  bday20-a7k92p "), "BDAY20-A7K92P");
  assert.throws(
    () => normalizeCouponCode("DROP TABLE;"),
    (error) => expectAppError(error, 400, /Invalid coupon code/),
  );

  const codes = new Set(Array.from({ length: 64 }, () => generateUniqueCouponCode("BDAY20")));
  assert.equal(codes.size, 64);
  for (const code of codes) assert.match(code, /^BDAY20-[A-F0-9]{12}$/);
});

test("deal redemption checks disabled, future, and expired campaign windows", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  assert.throws(
    () => assertDealRedeemable(baseDeal({ isActive: false }), now),
    (error) => expectAppError(error, 400, /disabled/),
  );
  assert.throws(
    () =>
      assertDealRedeemable(
        baseDeal({ validFrom: new Date("2026-08-18T00:00:00.000Z") }),
        now,
      ),
    (error) => expectAppError(error, 400, /not started/),
  );
  assert.throws(
    () =>
      assertDealRedeemable(
        baseDeal({ validUntil: new Date("2026-08-16T23:59:59.999Z") }),
        now,
      ),
    (error) => expectAppError(error, 400, /expired/),
  );
});

test("discount calculation enforces percentage caps, fixed caps, and order bounds", () => {
  assert.equal(calculateCouponDiscount(5_000, "PERCENTAGE", 20, 1_500), 1_000);
  assert.equal(calculateCouponDiscount(10_000, "PERCENTAGE", 20, 1_500), 1_500);
  assert.equal(calculateCouponDiscount(700, "FIXED_AMOUNT", 1_000), 700);
  assert.equal(calculateCouponDiscount(999.99, "PERCENTAGE", 12.5), 125);
  assert.throws(
    () => calculateCouponDiscount(-1, "PERCENTAGE", 20),
    (error) => expectAppError(error, 400, /non-negative/),
  );
});

test("personalized coupon validation rejects the wrong customer", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const intruderId = new mongoose.Types.ObjectId();
  const deal = baseDeal();
  const coupon = personalizedCoupon(deal, ownerId);

  await withReplacements(
    [
      [IssuedCoupon as any, "findOne", () => populatedCouponQuery(coupon)],
    ],
    async () => {
      await assert.rejects(
        validateCoupon(
          { code: coupon.code, userId: intruderId.toString(), orderAmount: 2_000 },
          { now: new Date("2026-08-18T00:00:00.000Z") },
        ),
        (error) => expectAppError(error, 403, /not valid for your account/),
      );
    },
  );
});

test("expired personalized coupon is atomically marked expired and rejected", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const deal = baseDeal();
  const coupon = personalizedCoupon(deal, ownerId, {
    expiresAt: new Date("2026-08-17T00:00:00.000Z"),
  });
  let expiryFilter: Record<string, unknown> | undefined;
  let expiryUpdate: Record<string, unknown> | undefined;

  await withReplacements(
    [
      [IssuedCoupon as any, "findOne", () => populatedCouponQuery(coupon)],
      [IssuedCoupon as any, "updateOne", async (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
      ) => {
        expiryFilter = filter;
        expiryUpdate = update;
        return { modifiedCount: 1 };
      }],
    ],
    async () => {
      await assert.rejects(
        validateCoupon(
          { code: coupon.code, userId: ownerId.toString(), orderAmount: 2_000 },
          { now: new Date("2026-08-18T00:00:00.000Z") },
        ),
        (error) => expectAppError(error, 400, /expired/),
      );
    },
  );

  assert.deepEqual(expiryFilter, { _id: coupon._id, status: "ACTIVE" });
  assert.deepEqual(expiryUpdate, { $set: { status: "EXPIRED" } });
});

test("coupon validation enforces minimum order and returns authoritative capped discount", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const deal = baseDeal({ maximumDiscountAmount: 1_500 });
  const coupon = personalizedCoupon(deal, ownerId, { maximumDiscountAmount: 1_500 });

  await withReplacements(
    [
      [IssuedCoupon as any, "findOne", () => populatedCouponQuery(coupon)],
      [DealUsage as any, "findOne", async () => null],
    ],
    async () => {
      await assert.rejects(
        validateCoupon(
          { code: coupon.code, userId: ownerId.toString(), orderAmount: 999 },
          { now: new Date("2026-08-18T00:00:00.000Z") },
        ),
        (error) => expectAppError(error, 400, /Minimum order amount is Rs. 1000/),
      );

      const result = await validateCoupon(
        { code: coupon.code, userId: ownerId.toString(), orderAmount: 10_000 },
        { now: new Date("2026-08-18T00:00:00.000Z") },
      );
      assert.equal(result.valid, true);
      assert.equal(result.coupon.isPersonalized, true);
      assert.equal(result.discountAmount, 1_500);
      assert.equal(result.coupon.dealName, "Birthday Special");
    },
  );
});

test("personalized redemption uses an ACTIVE compare-and-set for one-use safety", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const deal = baseDeal();
  const coupon = personalizedCoupon(deal, ownerId);
  let redemptionFilter: Record<string, any> | undefined;
  let redemptionUpdate: Record<string, any> | undefined;

  const result = await withReplacements(
    [
      [IssuedCoupon as any, "findOne", () => populatedCouponQuery(coupon)],
      [DealUsage as any, "findOne", async () => null],
      [Deal as any, "findById", async () => deal],
      [Deal as any, "findOneAndUpdate", async () => deal],
      [DealUsage as any, "findOneAndUpdate", async () => ({ count: 1 })],
      [IssuedCoupon as any, "findOneAndUpdate", async (
        filter: Record<string, any>,
        update: Record<string, any>,
      ) => {
        redemptionFilter = filter;
        redemptionUpdate = update;
        return { ...coupon, status: "USED", usedOrderId: orderId };
      }],
    ],
    () =>
      redeemCoupon(
        {
          code: coupon.code,
          userId: ownerId.toString(),
          orderId: orderId.toString(),
          orderAmount: 5_000,
        },
        { now: new Date("2026-08-18T00:00:00.000Z") },
      ),
  );

  assert.equal(redemptionFilter?.status, "ACTIVE");
  assert.equal(redemptionFilter?.userId.toString(), ownerId.toString());
  assert.deepEqual(redemptionFilter?.validFrom, {
    $lte: new Date("2026-08-18T00:00:00.000Z"),
  });
  assert.equal(redemptionUpdate?.$set.status, "USED");
  assert.equal(redemptionUpdate?.$set.usedOrderId.toString(), orderId.toString());
  assert.equal(result.discountAmount, 1_000);
});

test("order schema preserves complete coupon financial snapshots and legacy orders", () => {
  const baseOrder = {
    orderNumber: "EL-TEST-1001",
    customerId: new mongoose.Types.ObjectId(),
    customer: {
      name: "Reader One",
      phone: "9800000001",
      province: "Bagmati",
      city: "Kathmandu",
      area: "Lazimpat",
    },
    items: [
      {
        bookId: new mongoose.Types.ObjectId(),
        title: "A Book",
        coverImage: "https://example.test/book.jpg",
        price: 5_000,
        discountPercentage: 0,
        finalPrice: 5_000,
        quantity: 1,
      },
    ],
    subtotal: 5_000,
    discountAmount: 0,
    deliveryFee: 150,
    totalAmount: 5_150,
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "PENDING",
  };

  const legacyOrder = new Order(baseOrder);
  assert.equal(legacyOrder.validateSync(), undefined);
  assert.equal(legacyOrder.couponCode, undefined);

  const couponId = new mongoose.Types.ObjectId();
  const dealId = new mongoose.Types.ObjectId();
  const snapshot = new Order({
    ...baseOrder,
    orderNumber: "EL-TEST-1002",
    itemDiscountAmount: 0,
    couponDiscountAmount: 1_000,
    discountAmount: 1_000,
    couponCode: "BDAY20-A7K92P",
    couponId,
    dealId,
    totalAmount: 4_150,
  });
  assert.equal(snapshot.validateSync(), undefined);
  const stored = snapshot.toObject();
  assert.equal(stored.subtotal, 5_000);
  assert.equal(stored.couponDiscountAmount, 1_000);
  assert.equal(stored.discountAmount, 1_000);
  assert.equal(stored.deliveryFee, 150);
  assert.equal(stored.totalAmount, 4_150);
  assert.equal(stored.couponCode, "BDAY20-A7K92P");
  assert.equal(stored.couponId?.toString(), couponId.toString());
  assert.equal(stored.dealId?.toString(), dealId.toString());
});

test("order notification descriptors use real order numbers and stable transition keys", () => {
  const orderNumber = "EL-REAL-1234";
  const expected = {
    CONFIRMED: "ORDER_CONFIRMED",
    PROCESSING: "ORDER_PROCESSING",
    SHIPPED: "ORDER_SHIPPED",
    DELIVERED: "ORDER_DELIVERED",
    CANCELLED: "ORDER_CANCELLED",
  } as const;

  for (const [status, type] of Object.entries(expected)) {
    const descriptor = getOrderNotificationDescriptor(orderNumber, status as any);
    assert.ok(descriptor);
    assert.equal(descriptor.type, type);
    assert.equal(descriptor.key, `status:${status}`);
    assert.match(descriptor.message, /EL-REAL-1234/);
    assert.deepEqual(
      getOrderNotificationDescriptor(orderNumber, status as any),
      descriptor,
    );
  }
  assert.equal(getOrderNotificationDescriptor(orderNumber, "PENDING"), null);
});

test("unchanged order status returns without another write or notification", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    orderNumber: "EL-NO-DUPLICATE",
    customerId: new mongoose.Types.ObjectId(),
    orderStatus: "CONFIRMED",
    paymentStatus: "PENDING",
    paymentMethod: "COD",
    stockRestored: false,
    statusVersion: 2,
    items: [],
  };
  let updateCalls = 0;
  let notificationCalls = 0;

  const result = await withReplacements(
    [
      [Order as any, "findById", async () => order],
      [Order as any, "findOneAndUpdate", async () => {
        updateCalls += 1;
        return order;
      }],
      [Notification as any, "findOneAndUpdate", async () => {
        notificationCalls += 1;
        return {};
      }],
      [Notification as any, "create", async () => {
        notificationCalls += 1;
        return {};
      }],
    ],
    () => updateOrderStatus(orderId.toString(), "CONFIRMED", "PENDING"),
  );

  assert.equal(result, order);
  assert.equal(updateCalls, 0);
  assert.equal(notificationCalls, 0);
});

test("notification templates substitute known variables without erasing unknown ones", () => {
  assert.equal(
    renderNotificationTemplate(
      "Happy Birthday, {firstName}. Use {couponCode}; keep {futureToken}.",
      { firstName: "Ankit", couponCode: "BDAY20-A7K92P" },
    ),
    "Happy Birthday, Ankit. Use BDAY20-A7K92P; keep {futureToken}.",
  );
});

test("birthday notification creation uses a unique dedupe key and contextual IDs", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const couponId = new mongoose.Types.ObjectId().toString();
  const dealId = new mongoose.Types.ObjectId().toString();
  const dedupeKey = `birthday:${dealId}:${userId}:2026`;
  let filter: Record<string, unknown> | undefined;
  let update: Record<string, any> | undefined;

  await withReplacements(
    [
      [Notification as any, "findOneAndUpdate", async (
        query: Record<string, unknown>,
        change: Record<string, any>,
      ) => {
        filter = query;
        update = change;
        return change.$setOnInsert;
      }],
    ],
    () =>
      createBirthdayRewardNotification(
        userId,
        "Ankit",
        "BDAY20-A7K92P",
        20,
        new Date("2026-08-24T00:00:00.000Z"),
        {
          couponId,
          dealId,
          dealName: "Birthday Special",
          discountType: "PERCENTAGE",
          notificationTitle: "Happy Birthday, {firstName}!",
          notificationMessage: "Use {couponCode} for {discountLabel} off until {expiresAt}.",
          dedupeKey,
        },
      ),
  );

  assert.deepEqual(filter, { dedupeKey });
  assert.equal(update?.$setOnInsert.dedupeKey, dedupeKey);
  assert.equal(update?.$setOnInsert.title, "Happy Birthday, Ankit!");
  assert.match(update?.$setOnInsert.message, /BDAY20-A7K92P/);
  assert.equal(update?.$setOnInsert.data.couponId, couponId);
  assert.equal(update?.$setOnInsert.data.dealId, dealId);
});

test("notification schema provides ownership lookup and dedupe indexes", () => {
  const indexes = Notification.schema.indexes();
  assert.ok(
    indexes.some(([fields]) =>
      JSON.stringify(fields) === JSON.stringify({ userId: 1, createdAt: -1 }),
    ),
  );
  assert.ok(
    indexes.some(([fields]) =>
      JSON.stringify(fields) === JSON.stringify({ userId: 1, isRead: 1 }),
    ),
  );
  const dedupe = findNamedIndex(
    Notification as unknown as { schema: mongoose.Schema },
    "unique_notification_dedupe_key",
  );
  assert.ok(dedupe);
  assert.equal(dedupe[1].unique, true);
  assert.deepEqual(dedupe[1].partialFilterExpression, {
    dedupeKey: { $type: "string" },
  });
});

test("notification listing and unread count always scope queries to the current user", async () => {
  const userId = new mongoose.Types.ObjectId();
  let listFilter: Record<string, any> | undefined;
  let countFilter: Record<string, any> | undefined;

  const result = await withReplacements(
    [
      [Notification as any, "find", (query: Record<string, any>) => {
        listFilter = query;
        const chain = {
          sort: () => chain,
          skip: () => chain,
          limit: async () => [{ _id: new mongoose.Types.ObjectId() }],
        };
        return chain;
      }],
      [Notification as any, "countDocuments", async (query: Record<string, any>) => {
        countFilter = query;
        return 7;
      }],
    ],
    async () => ({
      list: await getUserNotifications(userId.toString(), {
        unreadOnly: true,
        page: 1,
        limit: 20,
      }),
      unread: await getUnreadCount(userId.toString()),
    }),
  );

  assert.equal(listFilter?.userId.toString(), userId.toString());
  assert.equal(listFilter?.isRead, false);
  assert.equal(countFilter?.userId.toString(), userId.toString());
  assert.equal(countFilter?.isRead, false);
  assert.equal(result.list.total, 7);
  assert.deepEqual(result.unread, { count: 7 });
});

test("mark-read and read-all updates include the authenticated user ownership filter", async () => {
  const userId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  let markFilter: Record<string, any> | undefined;
  let markUpdate: Record<string, any> | undefined;
  let allFilter: Record<string, any> | undefined;

  const result = await withReplacements(
    [
      [Notification as any, "findOneAndUpdate", async (
        query: Record<string, any>,
        update: Record<string, any>,
      ) => {
        markFilter = query;
        markUpdate = update;
        return { _id: notificationId, userId, isRead: true };
      }],
      [Notification as any, "updateMany", async (query: Record<string, any>) => {
        allFilter = query;
        return { modifiedCount: 3 };
      }],
    ],
    async () => ({
      marked: await markAsRead(notificationId.toString(), userId.toString()),
      all: await markAllAsRead(userId.toString()),
    }),
  );

  assert.equal(markFilter?._id.toString(), notificationId.toString());
  assert.equal(markFilter?.userId.toString(), userId.toString());
  assert.equal(markFilter?.isRead, false);
  assert.equal(markUpdate?.$set.isRead, true);
  assert.ok(markUpdate?.$set.readAt instanceof Date);
  assert.equal(allFilter?.userId.toString(), userId.toString());
  assert.equal(allFilter?.isRead, false);
  assert.equal((result.marked as any).isRead, true);
  assert.deepEqual(result.all, { modified: 3 });
});

test("a different user cannot mark another customer's notification read", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const attackerId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();
  const ownershipQueries: Record<string, any>[] = [];

  await withReplacements(
    [
      [Notification as any, "findOneAndUpdate", async (query: Record<string, any>) => {
        ownershipQueries.push(query);
        return null;
      }],
      [Notification as any, "findOne", async (query: Record<string, any>) => {
        ownershipQueries.push(query);
        return null;
      }],
    ],
    async () => {
      await assert.rejects(
        markAsRead(notificationId.toString(), attackerId.toString()),
        (error) => expectAppError(error, 404, /Notification not found/),
      );
    },
  );

  assert.equal(ownershipQueries.length, 2);
  for (const query of ownershipQueries) {
    assert.equal(query._id.toString(), notificationId.toString());
    assert.equal(query.userId.toString(), attackerId.toString());
    assert.notEqual(query.userId.toString(), ownerId.toString());
  }
});

test("campaign and order indexes support deal analytics and customer history", () => {
  const generalCode = findNamedIndex(
    Deal as unknown as { schema: mongoose.Schema },
    "unique_general_coupon_code",
  );
  assert.ok(generalCode);
  assert.equal(generalCode[1].unique, true);
  assert.deepEqual(generalCode[1].partialFilterExpression, { type: "GENERAL" });

  const orderIndexes = Order.schema.indexes().map(([fields]) => fields);
  assert.ok(
    orderIndexes.some(
      (fields) => JSON.stringify(fields) === JSON.stringify({ customerId: 1, createdAt: -1 }),
    ),
  );
  assert.ok(
    orderIndexes.some(
      (fields) => JSON.stringify(fields) === JSON.stringify({ dealId: 1, createdAt: -1 }),
    ),
  );
});
