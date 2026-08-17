import { Request, Response } from "express";
import { deleteImageByPublicId, uploadImageBuffer } from "../services/uploadService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { NODE_ENV } from "../config/env.js";

import { AppError } from "../utils/appError.js";
import { sendSuccess } from "../utils/response.js";

export const handleUploadSingle = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError("No file provided", 400);
    }

    if (NODE_ENV === "development") {
      console.log("Upload file received:", {
        mimeType: req.file.mimetype,
        size: req.file.size,
        bufferExists: Boolean(req.file.buffer),
        originalName: req.file.originalname,
      });
    }

    const imageType = req.body.imageType === "gallery" ? "gallery" : req.body.imageType === "homepage" ? "homepage" : "cover";
    
    const result = await uploadImageBuffer(req.file.buffer, undefined, imageType);
    return sendSuccess(res, result, 201, "Image uploaded successfully");
  }
);

export const handleUploadMultiple = asyncHandler(
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new AppError("No files provided", 400);
    }

    if (files.length > 5) {
      throw new AppError("Maximum 5 images allowed for gallery upload", 400);
    }

    const uploadPromises = files.map((file) => 
      uploadImageBuffer(file.buffer, undefined, "gallery")
    );
    const results = await Promise.all(uploadPromises);

    return sendSuccess(res, results, 201, "Images uploaded successfully");
  }
);

export const handleDeleteImage = asyncHandler(
  async (req: Request, res: Response) => {
    const { publicId } = req.body;
    if (!publicId) {
      throw new AppError("publicId is required", 400);
    }
    
    const success = await deleteImageByPublicId(publicId);
    if (!success) {
      throw new AppError("Failed to delete image from Cloudinary", 500);
    }
    
    return sendSuccess(res, null, 200, "Image deleted successfully");
  }
);
