import { Router } from "express";
import {
  handleInitiateEsewaPayment,
  handleEsewaSuccessCallback,
  handleEsewaFailureCallback,
} from "../controllers/esewaController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

// Customer initiate payment route
router.post("/initiate", protectCustomer, handleInitiateEsewaPayment);

// eSewa redirect callbacks (public)
router.get("/success", handleEsewaSuccessCallback);
router.get("/failure", handleEsewaFailureCallback);

export default router;
