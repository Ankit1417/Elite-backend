import { APP_TIMEZONE } from "../config/env.js";
import { Customer } from "../models/Customer.js";
import { Deal } from "../models/Deal.js";
import {
  BusinessDateParts,
  getDatePartsInTimezone,
  isBirthdayOnDate,
  isLeapYear,
} from "../utils/businessDate.js";
import {
  ensureBirthdayCoupon,
  expireOldCoupons,
} from "./issuedCouponService.js";
import { createBirthdayRewardNotification } from "./notificationService.js";

export { getDatePartsInTimezone, isBirthdayOnDate, isLeapYear };

interface ZonedDateTimeParts extends BusinessDateParts {
  hour: number;
  minute: number;
  second: number;
}

function zonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedDateTimeToUtc(
  parts: ZonedDateTimeParts,
  timeZone: string,
): Date {
  const wallClockUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = new Date(wallClockUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = zonedDateTimeParts(candidate, timeZone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    candidate = new Date(candidate.getTime() + (wallClockUtc - representedUtc));
  }
  return candidate;
}

export function millisecondsUntilNextBirthdayRun(
  now: Date,
  timeZone = APP_TIMEZONE,
  runHour = 0,
  runMinute = 5,
): number {
  const local = zonedDateTimeParts(now, timeZone);
  const passedToday =
    local.hour > runHour ||
    (local.hour === runHour && local.minute >= runMinute);
  const calendar = new Date(
    Date.UTC(local.year, local.month - 1, local.day + (passedToday ? 1 : 0)),
  );
  const target = zonedDateTimeToUtc(
    {
      year: calendar.getUTCFullYear(),
      month: calendar.getUTCMonth() + 1,
      day: calendar.getUTCDate(),
      hour: runHour,
      minute: runMinute,
      second: 0,
    },
    timeZone,
  );
  return Math.max(1_000, target.getTime() - now.getTime());
}

export async function processBirthdayRewards(now = new Date()) {
  await expireOldCoupons();
  const today = getDatePartsInTimezone(now, APP_TIMEZONE);
  const birthdayDeals = await Deal.find({
    type: "BIRTHDAY",
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  });
  if (birthdayDeals.length === 0) return { processed: 0, issued: 0, errors: 0 };

  const customers = await Customer.find({
    dateOfBirth: { $exists: true, $ne: null },
    birthdayOffersEnabled: true,
    isActive: true,
  });
  let processed = 0;
  let issued = 0;
  let errors = 0;

  for (const customer of customers) {
    if (!customer.dateOfBirth || !isBirthdayOnDate(customer.dateOfBirth, today)) continue;
    processed += 1;
    for (const deal of birthdayDeals) {
      try {
        const result = await ensureBirthdayCoupon(
          {
            dealId: deal._id.toString(),
            userId: customer._id.toString(),
            birthdayYear: today.year,
          },
          now,
        );
        const coupon = result.coupon;
        const firstName = customer.name.trim().split(/\s+/)[0] || "Reader";
        await createBirthdayRewardNotification(
          customer._id.toString(),
          firstName,
          coupon.code,
          coupon.discountValue,
          coupon.expiresAt,
          {
            couponId: coupon._id.toString(),
            dealId: deal._id.toString(),
            dealName: deal.name,
            discountType: coupon.discountType,
            notificationTitle: deal.notificationTitle,
            notificationMessage: deal.notificationMessage,
            dedupeKey: `birthday:${deal._id}:${customer._id}:${today.year}`,
          },
        );
        if (result.created) issued += 1;
      } catch (error) {
        errors += 1;
        console.error(
          `Birthday reward failed for customer ${customer._id} and deal ${deal._id}:`,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  }
  return { processed, issued, errors };
}

export function startBirthdayScheduler(): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let running = false;

  const scheduleNext = () => {
    if (stopped) return;
    const delay = millisecondsUntilNextBirthdayRun(new Date(), APP_TIMEZONE);
    timer = setTimeout(() => void run(), delay);
    timer.unref?.();
  };
  const run = async () => {
    if (running || stopped) return;
    running = true;
    let retrySoon = false;
    try {
      const result = await processBirthdayRewards();
      console.log("Birthday reward processing completed", result);
      retrySoon = result.errors > 0;
    } catch (error) {
      retrySoon = true;
      console.error(
        "Birthday reward processing failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      running = false;
      if (retrySoon && !stopped) {
        timer = setTimeout(() => void run(), 15 * 60 * 1000);
        timer.unref?.();
      } else {
        scheduleNext();
      }
    }
  };

  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export async function triggerBirthdayProcessing() {
  return processBirthdayRewards();
}
