import { Router } from "express";
import {
  handleCreateOrder,
  handleGetOrderByNumber,
  handleGetOrderById,
  handleGetAdminOrders,
  handleGetCustomerOrders,
  handleGetCustomerOrderById,
} from "../controllers/orderController.js";
import { protectCustomer, protectAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/number/:orderNumber", protectCustomer, handleGetOrderByNumber);

// Customer routes (require authentication)
router.post("/", protectCustomer, handleCreateOrder);
router.get("/my-orders", protectCustomer, handleGetCustomerOrders);
router.get("/:id", protectCustomer, handleGetCustomerOrderById);

export default router;
