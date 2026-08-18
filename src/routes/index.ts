import { Router } from "express";
import adminRoutes from "./adminRoutes.js";
import authRoutes from "./authRoutes.js";
import bookRoutes from "./bookRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import orderRoutes from "./orderRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import customerAuthRoutes from "./customerAuthRoutes.js";
import paymentSettingsRoutes from "./paymentSettingsRoutes.js";
import homepageRoutes from "./homepageRoutes.js";
import dealRoutes from "./dealRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import issuedCouponRoutes from "./issuedCouponRoutes.js";
import wishlistRoutes from "./wishlistRoutes.js";
import reviewRoutes from "./reviewRoutes.js";

const router = Router();

router.use("/admin/auth", authRoutes);
router.use("/admin/deals", dealRoutes);
router.use("/admin", adminRoutes);
router.use("/auth", customerAuthRoutes);
router.use("/categories", categoryRoutes);
router.use("/books", bookRoutes);
router.use("/orders", orderRoutes);
router.use("/upload", uploadRoutes);
router.use("/payment", paymentSettingsRoutes);
router.use("/homepage", homepageRoutes);
router.use("/notifications", notificationRoutes);
router.use("/coupons", issuedCouponRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/reviews", reviewRoutes);

export default router;
