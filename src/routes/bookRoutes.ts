import { Router } from "express";
import {
  handleCreateBook,
  handleDeleteBook,
  handleGetBookById,
  handleGetBookBySlug,
  handleGetBooks,
  handleGetRelatedBooks,
  handleUpdateBook,
} from "../controllers/bookController.js";
import {
  handleCreateReview,
  handleGetBookReviews,
  handleGetBookReviewSummary,
  handleGetMyReview,
} from "../controllers/reviewController.js";
import { protectAdmin, protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", handleGetBooks);
router.get("/slug/:slug", handleGetBookBySlug);
router.get("/:bookId/reviews", handleGetBookReviews);
router.get("/:bookId/reviews/summary", handleGetBookReviewSummary);
router.get("/:bookId/reviews/me", protectCustomer, handleGetMyReview);
router.post("/:bookId/reviews", protectCustomer, handleCreateReview);
router.get("/:id/related", handleGetRelatedBooks);
router.get("/:id", handleGetBookById);

// Admin protected routes
router.post("/", protectAdmin, handleCreateBook);
router.patch("/:id", protectAdmin, handleUpdateBook);
router.delete("/:id", protectAdmin, handleDeleteBook);

export default router;
