import { Request, Response } from "express";
import {
  createBook,
  deleteBook,
  getBookById,
  getBookBySlug,
  getBooks,
  getRelatedBooks,
  updateBook,
} from "../services/bookService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

export const handleGetBooks = asyncHandler(
  async (req: Request, res: Response) => {
    const options = {
      search: req.query.search ? String(req.query.search) : undefined,
      categorySlug: req.query.category ? String(req.query.category) : undefined,
      categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      inStock: req.query.inStock === "true",
      isFeatured: req.query.isFeatured === "true",
      isBestSeller: req.query.isBestSeller === "true",
      isNewArrival: req.query.isNewArrival === "true",
      hasDiscount: req.query.hasDiscount === "true",
      includeInactive: req.query.includeInactive === "true",
      sort: req.query.sort as "newest" | "price-asc" | "price-desc" | "discount",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await getBooks(options);
    return sendSuccess(res, result);
  }
);

export const handleGetBookBySlug = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const book = await getBookBySlug(slug);
    return sendSuccess(res, book);
  }
);

export const handleGetBookById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const includeInactive = req.query.includeInactive === "true";
    const book = await getBookById(id, includeInactive);
    return sendSuccess(res, book);
  }
);

export const handleGetRelatedBooks = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const limit = req.query.limit ? Number(req.query.limit) : 6;
    const books = await getRelatedBooks(id, limit);
    return sendSuccess(res, { books });
  }
);

export const handleCreateBook = asyncHandler(
  async (req: Request, res: Response) => {
    const book = await createBook(req.body);
    return sendSuccess(res, book, 201, "Book created successfully");
  }
);

export const handleUpdateBook = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const book = await updateBook(id, req.body);
    return sendSuccess(res, book, 200, "Book updated successfully");
  }
);

export const handleDeleteBook = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await deleteBook(id);
    return sendSuccess(res, null, 200, "Book deleted successfully");
  }
);
