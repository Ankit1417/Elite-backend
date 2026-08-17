import { UploadApiResponse } from "cloudinary";
import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { AppError } from "../utils/appError.js";
import { NODE_ENV } from "../config/env.js";

type ImageType = "cover" | "gallery" | "homepage";

const IMAGE_FOLDERS: Record<ImageType, string> = {
  cover: "elite-library/books/covers",
  gallery: "elite-library/books/gallery",
  homepage: "elite-library/homepage",
};

export function extractCloudinaryError(error: unknown): {
  message: string;
  httpCode?: number;
  name?: string;
} {
  const fallbackMessage =
    error instanceof Error ? error.message : String(error);
  const fallbackName = error instanceof Error ? error.name : "CloudinaryError";

  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    const nestedErr =
      typeof err.error === "object" && err.error !== null
        ? (err.error as Record<string, unknown>)
        : undefined;
    const candidate = nestedErr ?? err;

    return {
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : fallbackMessage,
      httpCode:
        typeof candidate.http_code === "number"
          ? candidate.http_code
          : typeof candidate.httpCode === "number"
            ? candidate.httpCode
            : typeof err.http_code === "number"
              ? err.http_code
              : typeof err.httpCode === "number"
                ? err.httpCode
                : undefined,
      name:
        typeof candidate.name === "string" ? candidate.name : fallbackName,
    };
  }

  return {
    message: fallbackMessage,
    name: fallbackName,
  };
}

function toUploadAppError(error: unknown): AppError {
  const { message, httpCode } = extractCloudinaryError(error);
  const normalizedMessage = message.toLowerCase();

  if (httpCode === 401) {
    return new AppError(
      "Cloudinary rejected the configured credentials. Check the cloud name, API key, and API secret.",
      502
    );
  }

  if (httpCode === 403) {
    return new AppError(
      "Cloudinary API key is authenticated but cannot create assets. In Cloudinary, open Settings > API Keys, select this key, and assign the Media Library Admin role.",
      502
    );
  }

  if (
    httpCode === 413 ||
    normalizedMessage.includes("file size") ||
    normalizedMessage.includes("too large")
  ) {
    return new AppError(
      "Cloudinary rejected the image because it exceeds the account upload limit.",
      413
    );
  }

  if (httpCode === 400) {
    const safeMessage = message
      .replace(/^\[prodenv:[^\]]+\]\s*/i, "")
      .slice(0, 300);
    return new AppError(`Cloudinary rejected the image: ${safeMessage}`, 400);
  }

  if (httpCode === 420 || httpCode === 429) {
    return new AppError(
      "Cloudinary is temporarily rate-limiting uploads. Please try again shortly.",
      503
    );
  }

  return new AppError(
    "Cloudinary could not upload the image. Please try again.",
    502
  );
}

export async function uploadImageBuffer(
  buffer: Buffer,
  folder?: string,
  imageType: ImageType = "cover"
): Promise<{ url: string; public_id: string }> {
  if (!isCloudinaryConfigured) {
    throw new AppError(
      "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment variables.",
      500
    );
  }

  const targetFolder = folder ?? IMAGE_FOLDERS[imageType];

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        // New Cloudinary product environments use dynamic folders. Keeping
        // public IDs independent from the asset folder also makes moves safe.
        asset_folder: targetFolder,
        timeout: 60_000,
      },
      (error: unknown, result?: UploadApiResponse) => {
        if (error || !result) {
          const extractedError = extractCloudinaryError(error);

          if (NODE_ENV === "development") {
            console.error("Cloudinary upload error:", extractedError);
          }

          return reject(toUploadAppError(error));
        }

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

export async function deleteImageByPublicId(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured || !publicId) {
    return false;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    console.error(
      "Failed to delete image from Cloudinary:",
      extractCloudinaryError(error)
    );
    return false;
  }
}

export async function deleteMultipleImages(publicIds: string[]): Promise<{ success: number; failed: number }> {
  if (!isCloudinaryConfigured || !publicIds || publicIds.length === 0) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const publicId of publicIds) {
    const result = await deleteImageByPublicId(publicId);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}
