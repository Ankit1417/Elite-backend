import { Router } from "express";
import {
  handleGetAdminOrders,
  handleGetDashboardStats,
  handleGetOrderById,
  handleUpdateAdminNotes,
  handleUpdateOrderStatus,
} from "../controllers/orderController.js";
import {
  handleAdminDeleteReview,
  handleAdminGetReview,
  handleAdminListReviews,
  handleAdminUpdateReviewStatus,
} from "../controllers/reviewController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectAdmin);

router.get("/dashboard/stats", handleGetDashboardStats);
router.get("/orders", handleGetAdminOrders);
router.get("/orders/:id", handleGetOrderById);
router.patch("/orders/:id/status", handleUpdateOrderStatus);
router.patch("/orders/:id/notes", handleUpdateAdminNotes);

// Review moderation
router.get("/reviews", handleAdminListReviews);
router.get("/reviews/:id", handleAdminGetReview);
router.patch("/reviews/:id/status", handleAdminUpdateReviewStatus);
router.delete("/reviews/:id", handleAdminDeleteReview);

export default router;
