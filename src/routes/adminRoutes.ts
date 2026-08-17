import { Router } from "express";
import {
  handleGetAdminOrders,
  handleGetDashboardStats,
  handleGetOrderById,
  handleUpdateAdminNotes,
  handleUpdateOrderStatus,
} from "../controllers/orderController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectAdmin);

router.get("/dashboard/stats", handleGetDashboardStats);
router.get("/orders", handleGetAdminOrders);
router.get("/orders/:id", handleGetOrderById);
router.patch("/orders/:id/status", handleUpdateOrderStatus);
router.patch("/orders/:id/notes", handleUpdateAdminNotes);

export default router;
