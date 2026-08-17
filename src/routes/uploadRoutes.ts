import { Router } from "express";
import {
  handleDeleteImage,
  handleUploadMultiple,
  handleUploadSingle,
} from "../controllers/uploadController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = Router();

router.use(protectAdmin);

router.post("/single", upload.single("image"), handleUploadSingle);
router.post("/multiple", upload.array("images", 5), handleUploadMultiple);
router.delete("/", handleDeleteImage);

export default router;
