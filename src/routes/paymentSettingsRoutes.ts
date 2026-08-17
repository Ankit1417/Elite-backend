import { Router } from "express";
import {
  getPaymentSettings,
  updatePaymentSettings,
} from "../controllers/paymentSettingsController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// Public endpoint for checkout
router.get("/payment-methods", getPaymentSettings);

// Admin-only endpoint to update settings
router.put("/settings", protectAdmin, updatePaymentSettings);

export default router;
