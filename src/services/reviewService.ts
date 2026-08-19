import mongoose, { FilterQuery } from "mongoose";
import { Book } from "../models/Book.js";
import { Customer } from "../models/Customer.js";
import { IReview, Review } from "../models/Review.js";
import { Order } from "../models/Order.js";
import { ReviewSort, ReviewStatus } from "../types/index.js";
import { AppError } from "../utils/appError.js";

/**
 * Only orders that reached the final delivered state qualify as verified
 * purchases for review eligibility.
 */
const REVIEWABLE_ORDER_STATUS = "DELIVERED";

export const REVIEW_MAX_COMMENT = 2000;
export const REVIEW_MAX_TITLE = 120;

interface CreateReviewInput {
  rating: number;
  title?: string;
  comment?: string;
}

interface UpdateReviewInput {
  rating?: number;
  title?: string;
  comment?: string;
}

export interface IReviewListOptions {
  page: number;
  limit: number;
  sort: ReviewSort;
}

export interface IAdminReviewListOptions {
  page: number;
  limit: number;
  status?: ReviewStatus;
  rating?: number;
  search?: string;
}

function assertValidObjectId(value: string, field: string): void {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`Invalid ${field}`, 400);
  }
}

function validateRating(rating: unknown): number {
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new AppError("Rating must be a whole number between 1 and 5", 400);
  }
  return value;
}

function validateComment(comment: unknown): string {
  if (comment === undefined || comment === null) return "";
  if (typeof comment !== "string") {
    throw new AppError("Review comment must be a string", 400);
  }
  const trimmed = comment.trim();
  if (trimmed.length > REVIEW_MAX_COMMENT) {
    throw new AppError(
      `Review must be ${REVIEW_MAX_COMMENT} characters or fewer`,
      400
    );
  }
  return trimmed;
}

function validateTitle(title: unknown): string | undefined {
  if (title === undefined || title === null) return undefined;
  if (typeof title !== "string") {
    throw new AppError("Review title must be a string", 400);
  }
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > REVIEW_MAX_TITLE) {
    throw new AppError(
      `Review title must be ${REVIEW_MAX_TITLE} characters or fewer`,
      400
    );
  }
  return trimmed;
}

/** Find the most recent delivered order that contains the given book. */
async function findCompletedOrderForBook(customerId: string, bookId: string) {
  return Order.findOne({
    customerId,
    orderStatus: REVIEWABLE_ORDER_STATUS,
    "items.bookId": bookId,
  }).sort({ createdAt: -1 });
}

/** Recalculate a book's published-review rating statistics. */
export async function recalculateBookRating(bookId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(bookId)) return;

  const [result] = await Review.aggregate([
    {
      $match: {
        book: new mongoose.Types.ObjectId(bookId),
        status: "published",
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avg: { $avg: "$rating" },
      },
    },
  ]);

  const reviewCount = result?.count ?? 0;
  const averageRating = reviewCount > 0 ? Math.round(result.avg * 10) / 10 : 0;

  await Book.updateOne(
    { _id: bookId },
    { $set: { averageRating, reviewCount } }
  );
}

/** Public published-review list with pagination and sorting. */
export async function getBookReviews(
  bookId: string,
  options: IReviewListOptions
) {
  assertValidObjectId(bookId, "book ID");
  const bookExists = await Book.exists({ _id: bookId, isActive: true });
  if (!bookExists) throw new AppError("Book not found", 404);

  let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
  if (options.sort === "highest") {
    sortOption = { rating: -1, createdAt: -1 };
  } else if (options.sort === "lowest") {
    sortOption = { rating: 1, createdAt: -1 };
  }

  const filter = { book: bookId, status: "published" as const };
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate("customer", "name")
      .sort(sortOption)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Review.countDocuments(filter),
  ]);

  return {
    reviews,
    total,
    page: options.page,
    pages: Math.ceil(total / options.limit),
  };
}

/** Public aggregate summary (average, count, distribution from real data). */
export async function getBookReviewSummary(bookId: string) {
  assertValidObjectId(bookId, "book ID");
  const bookExists = await Book.exists({ _id: bookId, isActive: true });
  if (!bookExists) throw new AppError("Book not found", 404);

  const [result] = await Review.aggregate([
    {
      $match: {
        book: new mongoose.Types.ObjectId(bookId),
        status: "published",
      },
    },
    {
      $facet: {
        stats: [
          { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: "$rating" } } },
        ],
        distribution: [{ $group: { _id: "$rating", count: { $sum: 1 } } }],
      },
    },
  ]);

  const stats = result?.stats?.[0];
  const reviewCount = stats?.count ?? 0;
  const averageRating =
    reviewCount > 0 ? Math.round(stats.avg * 10) / 10 : 0;

  const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const row of (result?.distribution ?? []) as {
    _id: number;
    count: number;
  }[]) {
    if (row._id >= 1 && row._id <= 5) distribution[row._id] = row.count;
  }

  return { averageRating, reviewCount, distribution };
}

/** Customer-specific review status + eligibility for a book. */
export async function getCustomerReviewStatus(
  bookId: string,
  customerId: string
) {
  assertValidObjectId(bookId, "book ID");
  const bookExists = await Book.exists({ _id: bookId });
  if (!bookExists) throw new AppError("Book not found", 404);

  const existingReview = await Review.findOne({ book: bookId, customer: customerId });

  return {
    authenticated: true,
    eligible: true,
    hasReviewed: Boolean(existingReview),
    review: existingReview ?? null,
  };
}

/** Create a review. Any authenticated customer can review; verified purchase is marked if delivered order exists. */
export async function createReview(
  bookId: string,
  customerId: string,
  input: CreateReviewInput
) {
  assertValidObjectId(bookId, "book ID");
  const rating = validateRating(input.rating);
  const comment = validateComment(input.comment);
  const title = validateTitle(input.title);

  const book = await Book.findOne({ _id: bookId, isActive: true });
  if (!book) throw new AppError("Book not found", 404);

  const existing = await Review.exists({ book: bookId, customer: customerId });
  if (existing) {
    throw new AppError("You have already reviewed this book.", 409);
  }

  const qualifyingOrder = await findCompletedOrderForBook(customerId, bookId);
  const isVerifiedPurchase = Boolean(qualifyingOrder);

  let review: IReview;
  try {
    review = await Review.create({
      book: bookId,
      customer: customerId,
      order: qualifyingOrder?._id,
      rating,
      title,
      comment,
      isVerifiedPurchase,
      status: "published",
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError("You have already reviewed this book.", 409);
    }
    throw err;
  }

  await recalculateBookRating(bookId);
  return review.populate("customer", "name");
}

/** Update a customer's own review (rating/title/comment only). */
export async function updateReview(
  reviewId: string,
  customerId: string,
  input: UpdateReviewInput
) {
  assertValidObjectId(reviewId, "review ID");

  const hasUpdates =
    input.rating !== undefined ||
    input.comment !== undefined ||
    input.title !== undefined;
  if (!hasUpdates) {
    throw new AppError("Provide at least one field to update", 400);
  }

  const review = await Review.findOne({ _id: reviewId, customer: customerId });
  if (!review) {
    // Do not reveal the existence of other customers' reviews.
    throw new AppError("Review not found", 404);
  }

  if (input.rating !== undefined) review.rating = validateRating(input.rating);
  if (input.comment !== undefined) review.comment = validateComment(input.comment);
  if (input.title !== undefined) review.title = validateTitle(input.title);

  await review.save();
  await recalculateBookRating(review.book.toString());
  return review.populate("customer", "name");
}

/** Delete a customer's own review. */
export async function deleteReview(reviewId: string, customerId: string) {
  assertValidObjectId(reviewId, "review ID");

  const review = await Review.findOneAndDelete({
    _id: reviewId,
    customer: customerId,
  });
  if (!review) {
    throw new AppError("Review not found", 404);
  }

  await recalculateBookRating(review.book.toString());
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Admin review list with pagination, filters and search. */
export async function adminListReviews(options: IAdminReviewListOptions) {
  const query: FilterQuery<IReview> = {};
  if (options.status) query.status = options.status;
  if (options.rating) query.rating = options.rating;

  if (options.search) {
    const regex = new RegExp(escapeRegExp(options.search), "i");
    const [matchingCustomers, matchingBooks] = await Promise.all([
      Customer.find({ name: regex }).select("_id"),
      Book.find({ title: regex }).select("_id"),
    ]);
    const customerIds = matchingCustomers.map((c) => c._id);
    const bookIds = matchingBooks.map((b) => b._id);
    const clauses: FilterQuery<IReview>[] = [
      { title: regex },
      { comment: regex },
    ];
    if (customerIds.length > 0) clauses.push({ customer: { $in: customerIds } });
    if (bookIds.length > 0) clauses.push({ book: { $in: bookIds } });
    query.$or = clauses;
  }

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate("book", "title slug coverImage")
      .populate("customer", "name phone")
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Review.countDocuments(query),
  ]);

  return {
    reviews,
    total,
    page: options.page,
    pages: Math.ceil(total / options.limit),
  };
}

export async function adminGetReview(reviewId: string) {
  assertValidObjectId(reviewId, "review ID");
  const review = await Review.findById(reviewId)
    .populate("book", "title slug coverImage")
    .populate("customer", "name phone email");
  if (!review) throw new AppError("Review not found", 404);
  return review;
}

export async function adminUpdateReviewStatus(
  reviewId: string,
  status: ReviewStatus
) {
  assertValidObjectId(reviewId, "review ID");
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", 404);

  review.status = status;
  await review.save();
  await recalculateBookRating(review.book.toString());
  return review;
}

export async function adminDeleteReview(reviewId: string) {
  assertValidObjectId(reviewId, "review ID");
  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) throw new AppError("Review not found", 404);
  await recalculateBookRating(review.book.toString());
  return true;
}