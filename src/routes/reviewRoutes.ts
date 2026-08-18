import { Router } from "express";
import {
  handleDeleteMyReview,
  handleUpdateMyReview,
} from "../controllers/reviewController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectCustomer);

router.patch("/:reviewId", handleUpdateMyReview);
router.delete("/:reviewId", handleDeleteMyReview);

export default router;