import { Router } from "express";
import {
  handleCreateDeal,
  handleGetDeals,
  handleGetDealById,
  handleUpdateDeal,
  handleDeleteDeal,
  handleGetDealAnalytics,
  handleGetDealIssuedCoupons,
} from "../controllers/dealController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectAdmin);

router.post("/", handleCreateDeal);
router.get("/", handleGetDeals);
router.get("/:id", handleGetDealById);
router.patch("/:id", handleUpdateDeal);
router.delete("/:id", handleDeleteDeal);
router.get("/:id/analytics", handleGetDealAnalytics);
router.get("/:id/coupons", handleGetDealIssuedCoupons);

export default router;
