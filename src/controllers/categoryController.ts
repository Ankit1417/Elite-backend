import { Request, Response } from "express";
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoryBySlug,
  updateCategory,
} from "../services/categoryService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

export const handleGetCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const includeInactive = req.query.includeInactive === "true";
    const categories = await getAllCategories(includeInactive);
    return sendSuccess(res, categories);
  }
);

export const handleGetCategoryBySlug = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const category = await getCategoryBySlug(slug);
    return sendSuccess(res, category);
  }
);

export const handleCreateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const category = await createCategory(req.body);
    return sendSuccess(res, category, 201, "Category created successfully");
  }
);

export const handleUpdateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const category = await updateCategory(id, req.body);
    return sendSuccess(res, category, 200, "Category updated successfully");
  }
);

export const handleDeleteCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await deleteCategory(id);
    return sendSuccess(res, null, 200, "Category deleted successfully");
  }
);
