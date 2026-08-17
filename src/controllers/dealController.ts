import { Request, Response } from "express";
import {
  createDeal,
  getDealById,
  getDeals,
  updateDeal,
  deleteDeal,
  getDealAnalytics,
  getDealIssuedCoupons,
  DEAL_TYPES,
  COUPON_STATUSES,
} from "../services/dealService.js";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import {
  parseOptionalBoolean,
  parseOptionalEnum,
  parsePagination,
} from "../utils/requestValidation.js";
import { DealType } from "../models/Deal.js";
import { CouponStatus } from "../models/IssuedCoupon.js";

export const handleCreateDeal = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const adminId = req.admin?.adminId;
    const deal = await createDeal({ ...req.body, createdBy: adminId });
    return sendSuccess(res, deal, 201, "Deal created successfully");
  }
);

export const handleGetDeals = asyncHandler(
  async (req: Request, res: Response) => {
    const options = {
      type: parseOptionalEnum<DealType>(req.query.type, DEAL_TYPES, "Deal type"),
      isActive: parseOptionalBoolean(req.query.isActive, "Active filter"),
      search: req.query.search ? String(req.query.search) : undefined,
      ...parsePagination(req.query.page, req.query.limit),
    };
    const result = await getDeals(options);
    return sendSuccess(res, result);
  }
);

export const handleGetDealById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deal = await getDealById(id);
    return sendSuccess(res, deal);
  }
);

export const handleUpdateDeal = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deal = await updateDeal(id, req.body);
    return sendSuccess(res, deal, 200, "Deal updated successfully");
  }
);

export const handleDeleteDeal = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await deleteDeal(id);
    return sendSuccess(res, result, 200, "Deal deleted successfully");
  }
);

export const handleGetDealAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const analytics = await getDealAnalytics(id);
    return sendSuccess(res, analytics);
  }
);

export const handleGetDealIssuedCoupons = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const options = {
      status: parseOptionalEnum<CouponStatus>(
        req.query.status,
        COUPON_STATUSES,
        "Coupon status",
      ),
      ...parsePagination(req.query.page, req.query.limit),
    };
    const result = await getDealIssuedCoupons(id, options);
    return sendSuccess(res, result);
  }
);
