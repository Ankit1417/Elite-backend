import { AppError } from "./appError.js";

export interface BusinessDateParts {
  year: number;
  month: number;
  day: number;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function getDatePartsInTimezone(
  date: Date,
  timeZone: string,
): BusinessDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

export function formatDateOnly(parts: BusinessDateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatStoredDateOnly(date?: Date | null): string | null {
  if (!date) return null;
  return formatDateOnly({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function parseStrictDateOnly(value: unknown): Date {
  if (typeof value !== "string") {
    throw new AppError("Birthday must use the YYYY-MM-DD format", 400);
  }

  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new AppError("Birthday must use the YYYY-MM-DD format", 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1900 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError("Please enter a valid birthday", 400);
  }

  return date;
}

export function assertDateIsNotFuture(
  date: Date,
  now: Date,
  timeZone: string,
): void {
  const birthday = formatStoredDateOnly(date);
  const today = formatDateOnly(getDatePartsInTimezone(now, timeZone));
  if (birthday && birthday > today) {
    throw new AppError("Birthday cannot be in the future", 400);
  }
}

export function canChangeBirthday(
  previousDate: Date | null | undefined,
  nextDate: Date,
  birthdayUpdatedAt: Date | null | undefined,
  now: Date,
): { changed: boolean; nextUpdatedAt?: Date } {
  if (!previousDate) {
    return { changed: true, nextUpdatedAt: now };
  }

  if (formatStoredDateOnly(previousDate) === formatStoredDateOnly(nextDate)) {
    return { changed: false };
  }

  const cooldownMs = 365 * 24 * 60 * 60 * 1000;
  if (birthdayUpdatedAt && now.getTime() - birthdayUpdatedAt.getTime() < cooldownMs) {
    const nextAllowed = new Date(birthdayUpdatedAt.getTime() + cooldownMs);
    throw new AppError(
      `For reward security, your birthday can only be changed once every 365 days. You can change it again after ${formatStoredDateOnly(nextAllowed)}.`,
      409,
    );
  }

  return { changed: true, nextUpdatedAt: now };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isBirthdayOnDate(
  dateOfBirth: Date,
  today: BusinessDateParts,
): boolean {
  const month = dateOfBirth.getUTCMonth() + 1;
  const day = dateOfBirth.getUTCDate();

  if (month === 2 && day === 29 && !isLeapYear(today.year)) {
    return today.month === 2 && today.day === 28;
  }

  return month === today.month && day === today.day;
}
