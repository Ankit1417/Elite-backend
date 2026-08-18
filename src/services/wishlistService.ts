import mongoose from "mongoose";
import { Customer } from "../models/Customer.js";
import { Book } from "../models/Book.js";
import { AppError } from "../utils/appError.js";

export async function getCustomerWishlist(customerId: string) {
  const customer = await Customer.findById(customerId).populate({
    path: "wishlist",
    match: { isActive: true },
    populate: { path: "category", select: "name slug" },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  // Filter out any null values if a referenced book was deleted or inactive
  const validWishlist = (customer.wishlist || []).filter((item) => item !== null);

  return validWishlist;
}

export async function getCustomerWishlistIds(customerId: string): Promise<string[]> {
  const customer = await Customer.findById(customerId).select("wishlist");

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  return (customer.wishlist || []).map((id) => id.toString());
}

export async function addToWishlist(customerId: string, bookId: string) {
  if (!mongoose.Types.ObjectId.isValid(bookId)) {
    throw new AppError("Invalid book ID", 400);
  }

  const bookExists = await Book.findOne({ _id: bookId, isActive: true });
  if (!bookExists) {
    throw new AppError("Book not found", 404);
  }

  const customer = await Customer.findByIdAndUpdate(
    customerId,
    { $addToSet: { wishlist: bookId } },
    { new: true }
  ).populate({
    path: "wishlist",
    match: { isActive: true },
    populate: { path: "category", select: "name slug" },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  return (customer.wishlist || []).filter((item) => item !== null);
}

export async function removeFromWishlist(customerId: string, bookId: string) {
  if (!mongoose.Types.ObjectId.isValid(bookId)) {
    throw new AppError("Invalid book ID", 400);
  }

  const customer = await Customer.findByIdAndUpdate(
    customerId,
    { $pull: { wishlist: bookId } },
    { new: true }
  ).populate({
    path: "wishlist",
    match: { isActive: true },
    populate: { path: "category", select: "name slug" },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  return (customer.wishlist || []).filter((item) => item !== null);
}
