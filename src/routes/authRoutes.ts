import { Router } from "express";
import {
  handleAdminLogin,
  handleAdminLogout,
  handleGetMe,
} from "../controllers/authController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import { rateLimitLogin } from "../middleware/rateLimitMiddleware.js";

const router = Router();

router.post("/login", rateLimitLogin, handleAdminLogin);
router.post("/logout", handleAdminLogout);
router.get("/me", protectAdmin, handleGetMe);

export default router;
