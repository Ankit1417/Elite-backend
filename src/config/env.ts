import dotenv from "dotenv";

dotenv.config({ quiet: true });

export type NodeEnvironment = "development" | "test" | "production";

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const DEFAULT_PORT = "5000";
const DEFAULT_NODE_ENV: NodeEnvironment = "development";
const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/elite_library";
const DEFAULT_JWT_SECRET = "elite_library_super_secret_jwt_key_2026";
const DEFAULT_ADMIN_EMAIL = "admin@elitelibrary.com";
const DEFAULT_ADMIN_PASSWORD = "AdminPassword123!";
const DEFAULT_APP_TIMEZONE = "Asia/Kathmandu";
const DEFAULT_DELIVERY_FEE = "150";

const UAT_ESEWA_SECRET_KEY = "8gBm/:&EnhH.1/q";
const DEFAULT_ESEWA_PRODUCT_CODE = "EPAYTEST";
const DEFAULT_ESEWA_PAYMENT_URL = "https://rc-epay.esewa.com.np/api/epay/main/v2/form";
const DEFAULT_ESEWA_STATUS_URL = "https://rc.esewa.com.np/api/epay/transaction/status/";

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
  const normalized = value.toLowerCase() as NodeEnvironment;
  if (!NODE_ENVIRONMENTS.includes(normalized)) {
    throw new Error(
      `NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(", ")}`
    );
  }

  return normalized;
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

export const PORT = validatePort(cleanString(process.env.PORT) ?? DEFAULT_PORT);
export const NODE_ENV = validateNodeEnvironment(
  cleanString(process.env.NODE_ENV) ?? DEFAULT_NODE_ENV
);
export const FRONTEND_URL = validateFrontendUrl(
  cleanString(process.env.FRONTEND_URL) ?? DEFAULT_FRONTEND_URL
);
export const MONGODB_URI = validateMongoDbUri(
  cleanString(process.env.MONGODB_URI) ?? DEFAULT_MONGODB_URI
);

const configuredJwtSecret = cleanString(process.env.JWT_SECRET) ?? DEFAULT_JWT_SECRET;
if (NODE_ENV === "production") {
  if (configuredJwtSecret === DEFAULT_JWT_SECRET || !cleanString(process.env.JWT_SECRET)) {
    throw new Error("JWT_SECRET must be explicitly configured in production");
  }
  if (configuredJwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters in production");
  }
}
export const JWT_SECRET = configuredJwtSecret;

export const APP_TIMEZONE = validateTimeZone(
  cleanString(process.env.APP_TIMEZONE) ?? DEFAULT_APP_TIMEZONE
);
export const DELIVERY_FEE = validateNonNegativeAmount(
  cleanString(process.env.DELIVERY_FEE) ?? DEFAULT_DELIVERY_FEE,
  "DELIVERY_FEE"
);

export const CLOUDINARY_CLOUD_NAME = cleanString(process.env.CLOUDINARY_CLOUD_NAME) ?? "";
export const CLOUDINARY_API_KEY = cleanString(process.env.CLOUDINARY_API_KEY) ?? "";
export const CLOUDINARY_API_SECRET = cleanString(process.env.CLOUDINARY_API_SECRET) ?? "";

export const ADMIN_EMAIL = cleanString(process.env.ADMIN_EMAIL) ?? DEFAULT_ADMIN_EMAIL;
export const ADMIN_PHONE = cleanString(process.env.ADMIN_PHONE) ?? "";
export const ADMIN_PASSWORD = cleanString(process.env.ADMIN_PASSWORD) ?? DEFAULT_ADMIN_PASSWORD;

// eSewa ePay V2 Configuration
export const ESEWA_ENVIRONMENT = (cleanString(process.env.ESEWA_ENVIRONMENT) ?? "test").toLowerCase();
export const ESEWA_PRODUCT_CODE = cleanString(process.env.ESEWA_PRODUCT_CODE) ?? DEFAULT_ESEWA_PRODUCT_CODE;

function resolveEsewaSecretKey(): string {
  const envKey = cleanString(process.env.ESEWA_SECRET_KEY);
  const isEsewaProduction = ESEWA_ENVIRONMENT === "production";

  if (isEsewaProduction) {
    if (!envKey) {
      throw new Error("ESEWA_SECRET_KEY must be explicitly configured when ESEWA_ENVIRONMENT is 'production'");
    }
    if (envKey === UAT_ESEWA_SECRET_KEY) {
      throw new Error("Cannot use UAT test secret key in production eSewa environment");
    }
    return envKey;
  }

  // In test / UAT mode:
  // If user provided a key in env (e.g. UAT key on Render), use it
  // Otherwise default to UAT key
  return envKey ?? UAT_ESEWA_SECRET_KEY;
}

export const ESEWA_SECRET_KEY = resolveEsewaSecretKey();

export const ESEWA_PAYMENT_URL = cleanString(process.env.ESEWA_PAYMENT_URL) ?? (
  ESEWA_ENVIRONMENT === "production"
    ? "https://epay.esewa.com.np/api/epay/main/v2/form"
    : DEFAULT_ESEWA_PAYMENT_URL
);

export const ESEWA_STATUS_URL = cleanString(process.env.ESEWA_STATUS_URL) ?? (
  ESEWA_ENVIRONMENT === "production"
    ? "https://epay.esewa.com.np/api/epay/transaction/status/"
    : DEFAULT_ESEWA_STATUS_URL
);

const backendBaseUrl = `http://localhost:${PORT}/api`;
export const ESEWA_SUCCESS_URL = cleanString(process.env.ESEWA_SUCCESS_URL) ?? `${backendBaseUrl}/payments/esewa/success`;
export const ESEWA_FAILURE_URL = cleanString(process.env.ESEWA_FAILURE_URL) ?? `${backendBaseUrl}/payments/esewa/failure`;

/**
 * Diagnostic logger to verify environment variable presence without leaking sensitive secrets.
 */
export function logEnvironmentDiagnostics(): void {
  const isConfigured = (key?: string | null) =>
    key && key.trim().length > 0 ? "configured" : "missing";

  console.log("=== Runtime Environment Diagnostics ===");
  console.log({
    NODE_ENV,
    PORT,
    APP_TIMEZONE,
    FRONTEND_URL,
    MONGODB_URI: MONGODB_URI ? "configured" : "missing",
    JWT_SECRET: isConfigured(process.env.JWT_SECRET),
    ADMIN_EMAIL: ADMIN_EMAIL ? "configured" : "missing",
    CLOUDINARY_CONFIGURED: Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET),
    ESEWA_ENVIRONMENT,
    ESEWA_PRODUCT_CODE,
    ESEWA_SECRET_KEY: isConfigured(process.env.ESEWA_SECRET_KEY || ESEWA_SECRET_KEY),
    ESEWA_PAYMENT_URL,
    ESEWA_STATUS_URL,
    ESEWA_SUCCESS_URL,
    ESEWA_FAILURE_URL,
  });
  console.log("========================================");
}


