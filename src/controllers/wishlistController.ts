import { Response } from "express";
import { AuthenticatedRequest } from "../types/index.js";
import {
  addToWishlist,
  getCustomerWishlist,
  getCustomerWishlistIds,
  removeFromWishlist,
} from "../services/wishlistService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/appError.js";

export const handleGetWishlist = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);

    const wishlist = await getCustomerWishlist(customerId);
    return sendSuccess(res, { wishlist });
  }
);

export const handleGetWishlistIds = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);

    const wishlistIds = await getCustomerWishlistIds(customerId);
    return sendSuccess(res, { wishlistIds });
  }
);

export const handleAddToWishlist = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);

    const bookId = String(req.params.bookId);
    const wishlist = await addToWishlist(customerId, bookId);
    return sendSuccess(res, { wishlist }, 200, "Book added to wishlist");
  }
);

export const handleRemoveFromWishlist = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);

    const bookId = String(req.params.bookId);
    const wishlist = await removeFromWishlist(customerId, bookId);
    return sendSuccess(res, { wishlist }, 200, "Book removed from wishlist");
  }
);
