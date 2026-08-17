import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { NODE_ENV } from "../config/env.js";
import { AppError } from "../utils/appError.js";

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  let statusCode = 500;
  let message = "Internal server error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof MulterError) {
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image is too large. Maximum file size is 10 MB."
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many images. Upload no more than 5 images at once."
          : "Invalid image upload request.";
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.message;
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  } else if ((err as unknown as { code?: number }).code === 11000) {
    statusCode = 400;
    message = "Duplicate value entered";
  } else if (err.message) {
    message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}
