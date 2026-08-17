import mongoose, { ClientSession } from "mongoose";

import { Book } from "../models/Book.js";
import { IOrderItem } from "../models/Order.js";
import { AppError } from "../utils/appError.js";

export interface CartItemInput {
  bookId: string;
  quantity: number;
}

export interface CartPricing {
  items: IOrderItem[];
  subtotal: number;
  itemDiscountAmount: number;
  merchandiseAmount: number;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeCartItems(items: unknown): CartItemInput[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Order must contain at least one item", 400);
  }
  if (items.length > 100) throw new AppError("An order cannot contain more than 100 items", 400);

  const quantities = new Map<string, number>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") throw new AppError("Invalid cart item", 400);
    const { bookId, quantity } = raw as { bookId?: unknown; quantity?: unknown };
    if (typeof bookId !== "string" || !mongoose.Types.ObjectId.isValid(bookId)) {
      throw new AppError("Invalid book ID", 400);
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new AppError("Item quantity must be a whole number between 1 and 99", 400);
    }
    const nextQuantity = (quantities.get(bookId) ?? 0) + quantity;
    if (nextQuantity > 99) throw new AppError("Item quantity cannot exceed 99", 400);
    quantities.set(bookId, nextQuantity);
  }

  return [...quantities].map(([bookId, quantity]) => ({ bookId, quantity }));
}

export async function priceCartItems(
  rawItems: unknown,
  session?: ClientSession,
): Promise<CartPricing> {
  const items = normalizeCartItems(rawItems);
  const ids = items.map((item) => new mongoose.Types.ObjectId(item.bookId));
  const query = Book.find({ _id: { $in: ids }, isActive: true });
  if (session) query.session(session);
  const books = await query;
  const booksById = new Map(books.map((book) => [book._id.toString(), book]));

  const snapshots: IOrderItem[] = [];
  let subtotal = 0;
  let itemDiscountAmount = 0;

  for (const item of items) {
    const book = booksById.get(item.bookId);
    if (!book) throw new AppError(`Book not found or unavailable: ${item.bookId}`, 400);
    if (book.stockQuantity < item.quantity) {
      throw new AppError(
        `Insufficient stock for "${book.title}". Available: ${book.stockQuantity}, Requested: ${item.quantity}`,
        400,
      );
    }

    const original = money(book.price * item.quantity);
    const current = money(book.finalPrice * item.quantity);
    subtotal += original;
    itemDiscountAmount += original - current;
    snapshots.push({
      bookId: book._id as mongoose.Types.ObjectId,
      title: book.title,
      coverImage: book.coverImage,
      price: book.price,
      discountPercentage: book.discountPercentage,
      finalPrice: book.finalPrice,
      quantity: item.quantity,
    });
  }

  subtotal = money(subtotal);
  itemDiscountAmount = money(itemDiscountAmount);
  return {
    items: snapshots,
    subtotal,
    itemDiscountAmount,
    merchandiseAmount: money(subtotal - itemDiscountAmount),
  };
}
