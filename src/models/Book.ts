import mongoose, { Document, Schema } from "mongoose";

export interface IBook extends Document {
  title: string;
  slug: string;
  author: string;
  description: string;
  category: mongoose.Types.ObjectId;
  publisher?: string;
  isbn?: string;
  language?: string;
  pages?: number;
  publicationYear?: number;
  edition?: string;
  coverImage: string;
  coverImagePublicId?: string;
  additionalImages: string[];
  additionalImagePublicIds: string[];
  price: number;
  discountPercentage: number;
  finalPrice: number;
  stockQuantity: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema = new Schema<IBook>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    author: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    publisher: {
      type: String,
      trim: true,
    },
    isbn: {
      type: String,
      trim: true,
    },
    language: {
      type: String,
      default: "English",
      trim: true,
    },
    pages: {
      type: Number,
      min: 1,
    },
    publicationYear: {
      type: Number,
    },
    edition: {
      type: String,
      trim: true,
    },
    coverImage: {
      type: String,
      required: true,
    },
    coverImagePublicId: {
      type: String,
    },
    additionalImages: {
      type: [String],
      default: [],
    },
    additionalImagePublicIds: {
      type: [String],
      default: [],
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    isNewArrival: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

BookSchema.pre("validate", function (next) {
  if (this.price !== undefined && this.discountPercentage !== undefined) {
    const discount = Math.min(100, Math.max(0, this.discountPercentage || 0));
    const calculated = this.price * (1 - discount / 100);
    this.finalPrice = Math.round(calculated * 100) / 100;
  }
  next();
});

export const Book = mongoose.model<IBook>("Book", BookSchema);
