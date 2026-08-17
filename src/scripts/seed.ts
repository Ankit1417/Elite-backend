import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD, MONGODB_URI } from "../config/env.js";
import { Admin } from "../models/Admin.js";
import { Book } from "../models/Book.js";
import { Category } from "../models/Category.js";
import { generateSlug } from "../utils/slugify.js";

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("977") && cleaned.length === 13) {
    return cleaned.substring(3);
  }
  return cleaned;
}

async function seed() {
  console.log("🌱 Starting Elite Library seed process...");

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB for seeding.");

    // 1. Seed Admin
    const existingAdmin = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const adminData: any = {
        email: ADMIN_EMAIL.toLowerCase(),
        passwordHash,
        name: "Elite Admin",
      };
      
      if (ADMIN_PHONE) {
        adminData.phone = normalizePhone(ADMIN_PHONE);
      }
      
      await Admin.create(adminData);
      console.log(`✅ Admin account created: ${ADMIN_EMAIL}`);
      if (ADMIN_PHONE) {
        console.log(`   Phone: ${normalizePhone(ADMIN_PHONE)}`);
      }
    } else {
      console.log(`ℹ️ Admin account already exists: ${ADMIN_EMAIL}`);
      // Update phone if provided and different
      if (ADMIN_PHONE && existingAdmin.phone !== normalizePhone(ADMIN_PHONE)) {
        await Admin.updateOne(
          { email: ADMIN_EMAIL.toLowerCase() },
          { phone: normalizePhone(ADMIN_PHONE) }
        );
        console.log(`   Updated phone to: ${normalizePhone(ADMIN_PHONE)}`);
      }
    }

    // 2. Seed Categories
    const categoriesData = [
      {
        name: "Fiction & Novels",
        description: "Classic literature, modern masterpieces, and captivating narratives.",
        image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=800",
      },
      {
        name: "Philosophy & Thought",
        description: "Timeless wisdom, ethics, existentialism, and modern intellectual explorations.",
        image: "https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?auto=format&fit=crop&q=80&w=800",
      },
      {
        name: "Business & Leadership",
        description: "Insights on strategy, economics, innovation, and legendary leadership.",
        image: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&q=80&w=800",
      },
      {
        name: "History & Culture",
        description: "Chronicles of civilization, historical biographies, and global heritage.",
        image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&q=80&w=800",
      },
      {
        name: "Art & Architecture",
        description: "Visual aesthetics, architectural marvels, and design history.",
        image: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&q=80&w=800",
      },
      {
        name: "Poetry & Drama",
        description: "Soulful verse, theatrical classics, and profound poetic reflections.",
        image: "https://images.unsplash.com/photo-1474932430478-367dbb6832c1?auto=format&fit=crop&q=80&w=800",
      },
    ];

    const categoryDocs: Record<string, mongoose.Types.ObjectId> = {};

    for (const cat of categoriesData) {
      const slug = generateSlug(cat.name);
      let category = await Category.findOne({ slug });
      if (!category) {
        category = await Category.create({
          ...cat,
          slug,
          isActive: true,
        });
        console.log(`✅ Category created: ${cat.name}`);
      }
      categoryDocs[cat.name] = category._id as mongoose.Types.ObjectId;
    }

    // 3. Seed Sample Books
    const booksData = [
      {
        title: "The Great Gatsby (Collector's Hardcover)",
        author: "F. Scott Fitzgerald",
        categoryName: "Fiction & Novels",
        description: "Set in the Jazz Age on Long Island, near New York City, the novel depicts first-person narrator Nick Carraway's interactions with mysterious millionaire Jay Gatsby and Gatsby's obsession to reunite with his former lover, Daisy Buchanan.",
        publisher: "Scribner Luxury Edition",
        isbn: "978-0743273565",
        language: "English",
        pages: 180,
        publicationYear: 1925,
        edition: "Collector's First Edition",
        coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=800",
        additionalImages: [
          "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=800",
        ],
        price: 2499,
        discountPercentage: 15,
        stockQuantity: 12,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        title: "Meditations: Deluxe Leather-Bound Edition",
        author: "Marcus Aurelius",
        categoryName: "Philosophy & Thought",
        description: "A series of personal writings by Marcus Aurelius, Roman Emperor from AD 161 to 180, recording his private notes to himself and ideas on Stoic philosophy.",
        publisher: "Penguin Classics Deluxe",
        isbn: "978-0140449334",
        language: "English",
        pages: 304,
        publicationYear: 2006,
        edition: "Hardcover Deluxe",
        coverImage: "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 3200,
        discountPercentage: 10,
        stockQuantity: 8,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: true,
      },
      {
        title: "Principles for Dealing with the Changing World Order",
        author: "Ray Dalio",
        categoryName: "Business & Leadership",
        description: "A bold examination of history’s most turbulent economic periods to reveal why the times ahead will likely be radically different from those we’ve experienced in our lifetimes.",
        publisher: "Avid Reader Press",
        isbn: "978-1982160272",
        language: "English",
        pages: 576,
        publicationYear: 2021,
        edition: "Illustrated Hardcover",
        coverImage: "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 4500,
        discountPercentage: 20,
        stockQuantity: 15,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: false,
      },
      {
        title: "Sapiens: A Brief History of Humankind",
        author: "Yuval Noah Harari",
        categoryName: "History & Culture",
        description: "Explore how Homo sapiens conquered the Earth through cognitive, agricultural, and scientific revolutions, shaping the modern global society.",
        publisher: "Harper",
        isbn: "978-0062316097",
        language: "English",
        pages: 464,
        publicationYear: 2015,
        edition: "Special Illustrated Edition",
        coverImage: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 3500,
        discountPercentage: 25,
        stockQuantity: 20,
        isFeatured: false,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        title: "The Architecture of Classical Antiquity",
        author: "Sir John Summerson",
        categoryName: "Art & Architecture",
        description: "An authoritative survey of classical proportions, column orders, and architectural masterpieces from ancient Greece and Rome to Renaissance revival.",
        publisher: "Thames & Hudson",
        isbn: "978-0500201770",
        language: "English",
        pages: 320,
        publicationYear: 2019,
        edition: "First Monograph",
        coverImage: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 5200,
        discountPercentage: 0,
        stockQuantity: 5,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: true,
      },
      {
        title: "Selected Poems of Rainer Maria Rilke",
        author: "Rainer Maria Rilke",
        categoryName: "Poetry & Drama",
        description: "Bilingual German-English edition featuring Rilke's profound lyrical works including Sonnets to Orpheus and Duino Elegies.",
        publisher: "Vintage Books",
        isbn: "978-0679722014",
        language: "German / English",
        pages: 256,
        publicationYear: 1989,
        edition: "Bilingual Masterpiece",
        coverImage: "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 2100,
        discountPercentage: 10,
        stockQuantity: 3,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
      },
      {
        title: "Beyond Good and Evil (Annotated)",
        author: "Friedrich Nietzsche",
        categoryName: "Philosophy & Thought",
        description: "Nietzsche accuses past philosophers of lacking critical sense and blindly accepting dogmatic premises in their consideration of morality.",
        publisher: "Oxford World Classics",
        isbn: "978-0199537075",
        language: "English",
        pages: 240,
        publicationYear: 2008,
        edition: "Annotated Critical Edition",
        coverImage: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 2800,
        discountPercentage: 12,
        stockQuantity: 0, // Test out of stock
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: false,
      },
      {
        title: "Zero to One: Notes on Startups",
        author: "Peter Thiel & Blake Masters",
        categoryName: "Business & Leadership",
        description: "The great secret of our time is that there are still uncharted frontiers to explore and new inventions to create. Learn how to build singular companies.",
        publisher: "Crown Business",
        isbn: "978-0804139298",
        language: "English",
        pages: 224,
        publicationYear: 2014,
        edition: "Hardcover First Print",
        coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 2999,
        discountPercentage: 15,
        stockQuantity: 18,
        isFeatured: false,
        isBestSeller: true,
        isNewArrival: false,
      },
      {
        title: "The Silk Roads: A New History of the World",
        author: "Peter Frankopan",
        categoryName: "History & Culture",
        description: "A major reassessment of world history, focusing on the region where empires met, trade flourished, and modern world affairs were forged.",
        publisher: "Knopf",
        isbn: "978-1101946320",
        language: "English",
        pages: 656,
        publicationYear: 2016,
        edition: "Hardcover Monograph",
        coverImage: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 3900,
        discountPercentage: 10,
        stockQuantity: 7,
        isFeatured: true,
        isBestSeller: false,
        isNewArrival: true,
      },
      {
        title: "1984 (75th Anniversary Edition)",
        author: "George Orwell",
        categoryName: "Fiction & Novels",
        description: "Winston Smith lives in a world dominated by Big Brother and the Party. A terrifying vision of dystopian surveillance and total control.",
        publisher: "Secker & Warburg",
        isbn: "978-0451524935",
        language: "English",
        pages: 328,
        publicationYear: 1949,
        edition: "Anniversary Hardcover",
        coverImage: "https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&q=80&w=800",
        additionalImages: [],
        price: 2750,
        discountPercentage: 20,
        stockQuantity: 25,
        isFeatured: true,
        isBestSeller: true,
        isNewArrival: false,
      },
    ];

    for (const book of booksData) {
      const slug = generateSlug(book.title);
      const categoryId = categoryDocs[book.categoryName];

      if (!categoryId) continue;

      const existingBook = await Book.findOne({ slug });
      if (!existingBook) {
        const discount = book.discountPercentage || 0;
        const finalPrice = Math.round(book.price * (1 - discount / 100) * 100) / 100;

        await Book.create({
          title: book.title,
          slug,
          author: book.author,
          category: categoryId,
          description: book.description,
          publisher: book.publisher,
          isbn: book.isbn,
          language: book.language,
          pages: book.pages,
          publicationYear: book.publicationYear,
          edition: book.edition,
          coverImage: book.coverImage,
          additionalImages: book.additionalImages,
          price: book.price,
          discountPercentage: discount,
          finalPrice,
          stockQuantity: book.stockQuantity,
          isFeatured: book.isFeatured,
          isBestSeller: book.isBestSeller,
          isNewArrival: book.isNewArrival,
          isActive: true,
        });
        console.log(`✅ Book created: ${book.title}`);
      }
    }

    console.log("🎉 Seed finished successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed with error:", error);
    process.exit(1);
  }
}

seed();
