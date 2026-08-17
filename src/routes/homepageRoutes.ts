import { Router } from "express";
import {
  handleGetHomepageSettings,
  handleUpdateHomepageSettings,
} from "../controllers/homepageController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// Public route for customer homepage
router.get("/", handleGetHomepageSettings);

// Admin routes for managing homepage
router.use(protectAdmin);
router.patch("/", handleUpdateHomepageSettings);

export default router;
