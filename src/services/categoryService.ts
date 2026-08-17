import { Book } from "../models/Book.js";
import { Category, ICategory } from "../models/Category.js";
import { AppError } from "../utils/appError.js";
import { generateSlug } from "../utils/slugify.js";

export async function getAllCategories(includeInactive = false) {
  const query = includeInactive ? {} : { isActive: true };
  return Category.find(query).sort({ name: 1 });
}

export async function getCategoryBySlug(slug: string) {
  const category = await Category.findOne({ slug });
  if (!category) {
    throw new AppError("Category not found", 404);
  }
  return category;
}

export async function createCategory(data: Partial<ICategory>) {
  if (!data.name?.trim()) {
    throw new AppError("Category name is required", 400);
  }

  const slug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);

  const existing = await Category.findOne({
    $or: [{ name: data.name.trim() }, { slug }],
  });

  if (existing) {
    throw new AppError("Category with this name or slug already exists", 400);
  }

  const category = new Category({
    ...data,
    name: data.name.trim(),
    slug,
  });

  return category.save();
}

export async function updateCategory(id: string, data: Partial<ICategory>) {
  const category = await Category.findById(id);
  if (!category) {
    throw new AppError("Category not found", 404);
  }

  if (data.name && data.name.trim() !== category.name) {
    const existingName = await Category.findOne({
      name: data.name.trim(),
      _id: { $ne: id },
    });
    if (existingName) {
      throw new AppError("Another category already has this name", 400);
    }
    category.name = data.name.trim();
  }

  if (data.slug) {
    const newSlug = generateSlug(data.slug);
    if (newSlug !== category.slug) {
      const existingSlug = await Category.findOne({
        slug: newSlug,
        _id: { $ne: id },
      });
      if (existingSlug) {
        throw new AppError("Another category already has this slug", 400);
      }
      category.slug = newSlug;
    }
  } else if (data.name) {
    category.slug = generateSlug(data.name);
  }

  if (data.description !== undefined) category.description = data.description;
  if (data.image !== undefined) category.image = data.image;
  if (data.isActive !== undefined) category.isActive = data.isActive;

  return category.save();
}

export async function deleteCategory(id: string) {
  const category = await Category.findById(id);
  if (!category) {
    throw new AppError("Category not found", 404);
  }

  const booksCount = await Book.countDocuments({ category: id });
  if (booksCount > 0) {
    throw new AppError(
      `Cannot delete category. It is referenced by ${booksCount} book(s). Consider deactivating it instead.`,
      400
    );
  }

  await category.deleteOne();
  return true;
}
