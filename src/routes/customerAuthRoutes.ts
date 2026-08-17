import { Router } from "express";
import {
  handleCustomerSignup,
  handleCustomerLogin,
  handleCustomerLogout,
  handleGetCustomerMe,
  handleUpdateCustomerProfile,
  handleDismissBirthdayPrompt,
} from "../controllers/customerAuthController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";
import { rateLimitLogin } from "../middleware/rateLimitMiddleware.js";

const router = Router();

router.post("/signup", rateLimitLogin, handleCustomerSignup);
router.post("/login", rateLimitLogin, handleCustomerLogin);
router.post("/logout", handleCustomerLogout);
router.get("/me", protectCustomer, handleGetCustomerMe);
router.patch("/profile", protectCustomer, handleUpdateCustomerProfile);
router.patch(
  "/birthday-prompt/dismiss",
  protectCustomer,
  handleDismissBirthdayPrompt,
);

export default router;
