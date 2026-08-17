import { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
) {
  return res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    data,
  });
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: unknown
) {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
}
