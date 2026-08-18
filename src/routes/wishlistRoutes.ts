import { Router } from "express";
import {
  handleAddToWishlist,
  handleGetWishlist,
  handleGetWishlistIds,
  handleRemoveFromWishlist,
} from "../controllers/wishlistController.js";
import { protectCustomer } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protectCustomer);

router.get("/", handleGetWishlist);
router.get("/ids", handleGetWishlistIds);
router.post("/:bookId", handleAddToWishlist);
router.delete("/:bookId", handleRemoveFromWishlist);

export default router;
