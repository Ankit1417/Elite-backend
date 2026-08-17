import { Response } from "express";
import {
  getUserCoupons,
  validateCouponForCart,
} from "../services/issuedCouponService.js";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/appError.js";
import { COUPON_STATUSES } from "../services/dealService.js";
import { CouponStatus } from "../models/IssuedCoupon.js";
import { parseOptionalEnum, parsePagination } from "../utils/requestValidation.js";

export const handleGetUserCoupons = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401);
    }

    const options = {
      status: parseOptionalEnum<CouponStatus>(
        req.query.status,
        COUPON_STATUSES,
        "Coupon status",
      ),
      ...parsePagination(req.query.page, req.query.limit),
    };

    const result = await getUserCoupons(customerId, options);
    return sendSuccess(res, result);
  }
);

export const handleValidateCoupon = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const { code, items } = req.body ?? {};

    const result = await validateCouponForCart({
      code,
      userId: customerId,
      items,
    });

    return sendSuccess(res, result);
  }
);
