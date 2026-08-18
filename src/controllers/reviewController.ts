import { Request, Response } from "express";
import { AuthenticatedRequest, ReviewSort, ReviewStatus } from "../types/index.js";
import {
  adminDeleteReview,
  adminGetReview,
  adminListReviews,
  adminUpdateReviewStatus,
  createReview,
  deleteReview,
  getBookReviews,
  getBookReviewSummary,
  getCustomerReviewStatus,
  updateReview,
} from "../services/reviewService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { AppError } from "../utils/appError.js";
import { parseOptionalEnum, parsePagination } from "../utils/requestValidation.js";

const REVIEW_SORTS: ReviewSort[] = ["newest", "highest", "lowest"];
const REVIEW_STATUSES: ReviewStatus[] = ["published", "hidden", "rejected"];

export const handleGetBookReviews = asyncHandler(
  async (req: Request, res: Response) => {
    const bookId = String(req.params.bookId);
    const options = {
      ...parsePagination(req.query.page, req.query.limit, 5),
      sort:
        parseOptionalEnum<ReviewSort>(req.query.sort, REVIEW_SORTS, "Sort") ??
        "newest",
    };
    const result = await getBookReviews(bookId, options);
    return sendSuccess(res, result);
  }
);

export const handleGetBookReviewSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const bookId = String(req.params.bookId);
    const summary = await getBookReviewSummary(bookId);
    return sendSuccess(res, summary);
  }
);

export const handleGetMyReview = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const bookId = String(req.params.bookId);
    const status = await getCustomerReviewStatus(bookId, customerId);
    return sendSuccess(res, status);
  }
);

export const handleCreateReview = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const bookId = String(req.params.bookId);
    const { rating, title, comment } = req.body ?? {};
    const review = await createReview(bookId, customerId, { rating, title, comment });
    return sendSuccess(res, { review }, 201, "Review submitted successfully");
  }
);

export const handleUpdateMyReview = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const reviewId = String(req.params.reviewId);
    const { rating, title, comment } = req.body ?? {};
    const review = await updateReview(reviewId, customerId, { rating, title, comment });
    return sendSuccess(res, { review }, 200, "Review updated successfully");
  }
);

export const handleDeleteMyReview = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const customerId = req.customer?.customerId;
    if (!customerId) throw new AppError("Authentication required", 401);
    const reviewId = String(req.params.reviewId);
    await deleteReview(reviewId, customerId);
    return sendSuccess(res, null, 200, "Review deleted successfully");
  }
);

export const handleAdminListReviews = asyncHandler(
  async (req: Request, res: Response) => {
    const options = {
      ...parsePagination(req.query.page, req.query.limit, 20),
      status: parseOptionalEnum<ReviewStatus>(
        req.query.status,
        REVIEW_STATUSES,
        "Status"
      ),
      rating: req.query.rating ? Number(req.query.rating) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
    };
    if (
      options.rating !== undefined &&
      (!Number.isInteger(options.rating) ||
        options.rating < 1 ||
        options.rating > 5)
    ) {
      throw new AppError("Rating filter must be a whole number between 1 and 5", 400);
    }
    const result = await adminListReviews(options);
    return sendSuccess(res, result);
  }
);

export const handleAdminGetReview = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const review = await adminGetReview(id);
    return sendSuccess(res, review);
  }
);

export const handleAdminUpdateReviewStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const status = parseOptionalEnum<ReviewStatus>(
      req.body?.status,
      REVIEW_STATUSES,
      "Review status"
    );
    if (!status) throw new AppError("Review status is required", 400);
    const review = await adminUpdateReviewStatus(id, status);
    return sendSuccess(res, review, 200, "Review status updated successfully");
  }
);

export const handleAdminDeleteReview = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await adminDeleteReview(id);
    return sendSuccess(res, null, 200, "Review deleted successfully");
  }
);