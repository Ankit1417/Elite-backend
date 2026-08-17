import { v2 as cloudinary } from "cloudinary";
import {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  NODE_ENV,
} from "./env.js";

const isCloudinaryConfigured = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
);

if (NODE_ENV === "development") {
  console.log("Cloudinary configuration:", {
    cloudNameConfigured: Boolean(CLOUDINARY_CLOUD_NAME),
    apiKeyConfigured: Boolean(CLOUDINARY_API_KEY),
    apiSecretConfigured: Boolean(CLOUDINARY_API_SECRET),
    isConfigured: isCloudinaryConfigured,
    configSource: "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
    hasCloudinaryUrl: Boolean(process.env.CLOUDINARY_URL),
  });
}

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
    // Cloudinary error objects can contain request authentication details.
    hide_sensitive: true,
  });
}

function getSafeCloudinaryError(error: unknown): {
  message: string;
  httpCode?: number;
} {
  if (typeof error === "object" && error !== null) {
    const outer = error as Record<string, unknown>;
    const nested =
      typeof outer.error === "object" && outer.error !== null
        ? (outer.error as Record<string, unknown>)
        : undefined;
    const candidate = nested ?? outer;

    return {
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : error instanceof Error
            ? error.message
            : "Unknown Cloudinary error",
      httpCode:
        typeof candidate.http_code === "number"
          ? candidate.http_code
          : typeof outer.http_code === "number"
            ? outer.http_code
            : undefined,
    };
  }

  return { message: String(error) };
}

// Temporary development-only authentication test
export async function testCloudinaryAuth(): Promise<{ success: boolean; error?: string; httpCode?: number }> {
  if (!isCloudinaryConfigured) {
    return { success: false, error: "Cloudinary not configured" };
  }

  try {
    // Use Cloudinary admin API to test authentication
    const result = await cloudinary.api.ping();
    if (result && result.status === "ok") {
      return { success: true };
    }
    return { success: false, error: "Unexpected ping response" };
  } catch (error: unknown) {
    if (NODE_ENV === "development") {
      console.error("Cloudinary authentication test error:", getSafeCloudinaryError(error));
    }

    const safeError = getSafeCloudinaryError(error);
    return {
      success: false,
      error: safeError.message,
      httpCode: safeError.httpCode,
    };
  }
}

export { cloudinary, isCloudinaryConfigured };
