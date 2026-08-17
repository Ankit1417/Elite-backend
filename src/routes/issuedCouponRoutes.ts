import { Router } from "express";
import {
  handleGetUserCoupons,
  handleValidateCoupon,
} from "../controllers/issuedCouponController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectCustomer);

router.get("/my-coupons", handleGetUserCoupons);
router.post("/validate", handleValidateCoupon);

export default router;
