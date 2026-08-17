import dotenv from "dotenv";

dotenv.config({ quiet: true });

export type NodeEnvironment = "development" | "test" | "production";

const DEFAULT_PORT = "5000";
const DEFAULT_NODE_ENV: NodeEnvironment = "development";
const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/elite_library";
const DEFAULT_JWT_SECRET = "elite_library_super_secret_jwt_key_2026";
const DEFAULT_ADMIN_EMAIL = "admin@elitelibrary.com";
const DEFAULT_ADMIN_PASSWORD = "AdminPassword123!";
const DEFAULT_APP_TIMEZONE = "Asia/Kathmandu";
const DEFAULT_DELIVERY_FEE = "150";

const NODE_ENVIRONMENTS: NodeEnvironment[] = [
  "development",
  "test",
  "production",
];

function validatePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function validateNodeEnvironment(value: string): NodeEnvironment {
  if (!NODE_ENVIRONMENTS.includes(value as NodeEnvironment)) {
    throw new Error(
      `NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(", ")}`
    );
  }

  return value as NodeEnvironment;
}

function validateFrontendUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("FRONTEND_URL must be a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("FRONTEND_URL must use http or https");
  }

  return url.origin;
}

function validateMongoDbUri(value: string): string {
  let uri: URL;

  try {
    uri = new URL(value);
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB connection string");
  }

  if (!["mongodb:", "mongodb+srv:"].includes(uri.protocol)) {
    throw new Error("MONGODB_URI must use mongodb or mongodb+srv");
  }

  if (!uri.hostname) {
    throw new Error("MONGODB_URI must include a hostname");
  }

  return value;
}

function validateTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new Error("APP_TIMEZONE must be a valid IANA timezone");
  }
  return value;
}

function validateNonNegativeAmount(value: string, name: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return Math.round(amount * 100) / 100;
}

export const PORT = validatePort(process.env.PORT ?? DEFAULT_PORT);
export const NODE_ENV = validateNodeEnvironment(
  process.env.NODE_ENV ?? DEFAULT_NODE_ENV
);
export const FRONTEND_URL = validateFrontendUrl(
  process.env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL
);
export const MONGODB_URI = validateMongoDbUri(
  process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI
);

const configuredJwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
if (NODE_ENV === "production" && configuredJwtSecret === DEFAULT_JWT_SECRET) {
  throw new Error("JWT_SECRET must be explicitly configured in production");
}
if (NODE_ENV === "production" && configuredJwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}
export const JWT_SECRET = configuredJwtSecret;
export const APP_TIMEZONE = validateTimeZone(
  process.env.APP_TIMEZONE ?? DEFAULT_APP_TIMEZONE,
);
export const DELIVERY_FEE = validateNonNegativeAmount(
  process.env.DELIVERY_FEE ?? DEFAULT_DELIVERY_FEE,
  "DELIVERY_FEE",
);

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? "";
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? "";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? "";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
export const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
