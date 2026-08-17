import { Router } from "express";
import {
  handleGetNotifications,
  handleGetUnreadCount,
  handleMarkAsRead,
  handleMarkAllAsRead,
  handleDeleteNotification,
} from "../controllers/notificationController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectCustomer);

router.get("/", handleGetNotifications);
router.get("/unread-count", handleGetUnreadCount);
router.patch("/read-all", handleMarkAllAsRead);
router.patch("/:id/read", handleMarkAsRead);
router.delete("/:id", handleDeleteNotification);

export default router;
