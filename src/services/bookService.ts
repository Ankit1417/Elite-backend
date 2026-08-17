import { FilterQuery } from "mongoose";
import { Book, IBook } from "../models/Book.js";
import { Category } from "../models/Category.js";
import { AppError } from "../utils/appError.js";
import { generateSlug } from "../utils/slugify.js";
import { deleteImageByPublicId, deleteMultipleImages } from "./uploadService.js";

export interface IBookFilterOptions {
  search?: string;
  categorySlug?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  hasDiscount?: boolean;
  includeInactive?: boolean;
  sort?: "newest" | "price-asc" | "price-desc" | "discount";
  page?: number;
  limit?: number;
}

export async function getBooks(options: IBookFilterOptions) {
  const {
    search,
    categorySlug,
    categoryId,
    minPrice,
    maxPrice,
    inStock,
    isFeatured,
    isBestSeller,
    isNewArrival,
    hasDiscount,
    includeInactive = false,
    sort = "newest",
    page = 1,
    limit = 20,
  } = options;

  const query: FilterQuery<IBook> = {};

  if (!includeInactive) {
    query.isActive = true;
  }

  if (categorySlug) {
    const category = await Category.findOne({ slug: categorySlug });
    if (category) {
      query.category = category._id;
    } else {
      // Return empty result if category slug doesn't exist
      return {
        books: [],
        total: 0,
        page,
        pages: 0,
      };
    }
  } else if (categoryId) {
    query.category = categoryId;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { author: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { isbn: { $regex: search, $options: "i" } },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    query.finalPrice = {};
    if (minPrice !== undefined) query.finalPrice.$gte = minPrice;
    if (maxPrice !== undefined) query.finalPrice.$lte = maxPrice;
  }

  if (inStock) {
    query.stockQuantity = { $gt: 0 };
  }

  if (isFeatured) query.isFeatured = true;
  if (isBestSeller) query.isBestSeller = true;
  if (isNewArrival) query.isNewArrival = true;
  if (hasDiscount) query.discountPercentage = { $gt: 0 };

  let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
  if (sort === "price-asc") sortOption = { finalPrice: 1 };
  else if (sort === "price-desc") sortOption = { finalPrice: -1 };
  else if (sort === "discount") sortOption = { discountPercentage: -1 };

  const skip = (page - 1) * limit;

  const [books, total] = await Promise.all([
    Book.find(query)
      .populate("category", "name slug")
      .sort(sortOption)
      .skip(skip)
      .limit(limit),
    Book.countDocuments(query),
  ]);

  return {
    books,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function getBookBySlug(slug: string) {
  const book = await Book.findOne({ slug, isActive: true }).populate(
    "category",
    "name slug"
  );
  if (!book) {
    throw new AppError("Book not found", 404);
  }
  return book;
}

export async function getBookById(id: string, includeInactive = false) {
  const query = includeInactive ? { _id: id } : { _id: id, isActive: true };
  const book = await Book.findById(query).populate("category", "name slug");
  if (!book) {
    throw new AppError("Book not found", 404);
  }
  return book;
}

export async function createBook(data: Partial<IBook>) {
  if (!data.title || !data.author || !data.category || !data.description || !data.coverImage) {
    throw new AppError("Title, author, category, description, and cover image are required", 400);
  }

  if (data.price === undefined || data.price < 0) {
    throw new AppError("Price must be a non-negative number", 400);
  }

  const discount = data.discountPercentage ?? 0;
  if (discount < 0 || discount > 100) {
    throw new AppError("Discount percentage must be between 0 and 100", 400);
  }

  const stock = data.stockQuantity ?? 0;
  if (stock < 0) {
    throw new AppError("Stock quantity must be non-negative", 400);
  }

  const slug = data.slug ? generateSlug(data.slug) : generateSlug(data.title);
  const existing = await Book.findOne({ slug });
  if (existing) {
    throw new AppError("A book with this title or slug already exists", 400);
  }

  const categoryExists = await Category.findById(data.category);
  if (!categoryExists) {
    throw new AppError("Selected category does not exist", 400);
  }

  const finalPrice = Math.round(data.price * (1 - discount / 100) * 100) / 100;

  const book = new Book({
    ...data,
    slug,
    discountPercentage: discount,
    finalPrice,
    stockQuantity: stock,
  });

  return book.save();
}

export async function updateBook(id: string, data: Partial<IBook>) {
  const book = await Book.findById(id);
  if (!book) {
    throw new AppError("Book not found", 404);
  }

  // Handle cover image replacement with Cloudinary cleanup
  if (data.coverImage !== undefined && data.coverImage !== book.coverImage) {
    const oldCoverPublicId = book.coverImagePublicId;
    book.coverImage = data.coverImage;
    book.coverImagePublicId = data.coverImagePublicId;
    
    // Delete old cover image from Cloudinary after successful update
    if (oldCoverPublicId) {
      deleteImageByPublicId(oldCoverPublicId).catch((err) => {
        console.error("Failed to delete old cover image:", err);
      });
    }
  }

  // Handle additional images updates with Cloudinary cleanup
  if (data.additionalImages !== undefined) {
    const removedImages: string[] = [];
    const removedPublicIds: string[] = [];
    
    // Find images that were removed
    if (book.additionalImages && book.additionalImagePublicIds) {
      book.additionalImages.forEach((oldImg, index) => {
        if (!data.additionalImages?.includes(oldImg)) {
          removedImages.push(oldImg);
          removedPublicIds.push(book.additionalImagePublicIds[index] || "");
        }
      });
    }
    
    book.additionalImages = data.additionalImages;
    book.additionalImagePublicIds = data.additionalImagePublicIds || [];
    
    // Delete removed images from Cloudinary
    if (removedPublicIds.length > 0) {
      deleteMultipleImages(removedPublicIds).catch((err) => {
        console.error("Failed to delete removed gallery images:", err);
      });
    }
  }

  if (data.title && data.title !== book.title) {
    const newSlug = data.slug ? generateSlug(data.slug) : generateSlug(data.title);
    const existing = await Book.findOne({ slug: newSlug, _id: { $ne: id } });
    if (existing) {
      throw new AppError("Another book with this title or slug already exists", 400);
    }
    book.title = data.title;
    book.slug = newSlug;
  } else if (data.slug && data.slug !== book.slug) {
    const newSlug = generateSlug(data.slug);
    const existing = await Book.findOne({ slug: newSlug, _id: { $ne: id } });
    if (existing) {
      throw new AppError("Another book with this slug already exists", 400);
    }
    book.slug = newSlug;
  }

  if (data.category && data.category.toString() !== book.category.toString()) {
    const categoryExists = await Category.findById(data.category);
    if (!categoryExists) {
      throw new AppError("Selected category does not exist", 400);
    }
    book.category = data.category;
  }

  if (data.price !== undefined) {
    if (data.price < 0) throw new AppError("Price must be non-negative", 400);
    book.price = data.price;
  }

  if (data.discountPercentage !== undefined) {
    if (data.discountPercentage < 0 || data.discountPercentage > 100) {
      throw new AppError("Discount percentage must be between 0 and 100", 400);
    }
    book.discountPercentage = data.discountPercentage;
  }

  if (data.stockQuantity !== undefined) {
    if (data.stockQuantity < 0) throw new AppError("Stock quantity must be non-negative", 400);
    book.stockQuantity = data.stockQuantity;
  }

  // Recalculate finalPrice
  const discount = book.discountPercentage || 0;
  book.finalPrice = Math.round(book.price * (1 - discount / 100) * 100) / 100;

  if (data.author !== undefined) book.author = data.author;
  if (data.description !== undefined) book.description = data.description;
  if (data.publisher !== undefined) book.publisher = data.publisher;
  if (data.isbn !== undefined) book.isbn = data.isbn;
  if (data.language !== undefined) book.language = data.language;
  if (data.pages !== undefined) book.pages = data.pages;
  if (data.publicationYear !== undefined) book.publicationYear = data.publicationYear;
  if (data.edition !== undefined) book.edition = data.edition;
  if (data.isFeatured !== undefined) book.isFeatured = data.isFeatured;
  if (data.isBestSeller !== undefined) book.isBestSeller = data.isBestSeller;
  if (data.isNewArrival !== undefined) book.isNewArrival = data.isNewArrival;
  if (data.isActive !== undefined) book.isActive = data.isActive;

  return book.save();
}

export async function deleteBook(id: string) {
  const book = await Book.findById(id);
  if (!book) {
    throw new AppError("Book not found", 404);
  }

  // Collect all Cloudinary public IDs to delete
  const publicIdsToDelete: string[] = [];
  
  if (book.coverImagePublicId) {
    publicIdsToDelete.push(book.coverImagePublicId);
  }
  
  if (book.additionalImagePublicIds && book.additionalImagePublicIds.length > 0) {
    publicIdsToDelete.push(...book.additionalImagePublicIds);
  }

  // Delete from Cloudinary
  if (publicIdsToDelete.length > 0) {
    deleteMultipleImages(publicIdsToDelete).catch((err) => {
      console.error("Failed to delete book images from Cloudinary:", err);
    });
  }

  await book.deleteOne();
  return true;
}
