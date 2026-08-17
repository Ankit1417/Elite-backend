import { Router } from "express";
import {
  handleCreateCategory,
  handleDeleteCategory,
  handleGetCategories,
  handleGetCategoryBySlug,
  handleUpdateCategory,
} from "../controllers/categoryController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", handleGetCategories);
router.get("/:slug", handleGetCategoryBySlug);

// Admin protected routes
router.post("/", protectAdmin, handleCreateCategory);
router.patch("/:id", protectAdmin, handleUpdateCategory);
router.delete("/:id", protectAdmin, handleDeleteCategory);

export default router;
