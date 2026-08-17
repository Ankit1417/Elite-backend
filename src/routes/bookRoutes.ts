import { Router } from "express";
import {
  handleCreateBook,
  handleDeleteBook,
  handleGetBookById,
  handleGetBookBySlug,
  handleGetBooks,
  handleUpdateBook,
} from "../controllers/bookController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", handleGetBooks);
router.get("/slug/:slug", handleGetBookBySlug);
router.get("/:id", handleGetBookById);

// Admin protected routes
router.post("/", protectAdmin, handleCreateBook);
router.patch("/:id", protectAdmin, handleUpdateBook);
router.delete("/:id", protectAdmin, handleDeleteBook);

export default router;
