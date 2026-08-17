import multer from "multer";
import { AppError } from "../utils/appError.js";

const storage = multer.memoryStorage();

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const fileFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_IMAGE_TYPES.has(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError("Only JPEG, PNG, and WebP images are allowed", 400));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 5,
  },
});
