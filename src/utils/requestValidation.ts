import { AppError } from "./appError.js";

export function parsePagination(
  pageValue: unknown,
  limitValue: unknown,
  defaultLimit = 20,
): { page: number; limit: number } {
  const page = pageValue === undefined ? 1 : Number(pageValue);
  const limit = limitValue === undefined ? defaultLimit : Number(limitValue);
  if (!Number.isInteger(page) || page < 1) {
    throw new AppError("Page must be a positive whole number", 400);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("Limit must be a whole number between 1 and 100", 400);
  }
  return { page, limit };
}

export function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  throw new AppError(`${field} must be true or false`, 400);
}

export function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === "") return undefined;
  const candidate = String(value) as T;
  if (!allowed.includes(candidate)) {
    throw new AppError(`${field} must be one of: ${allowed.join(", ")}`, 400);
  }
  return candidate;
}
