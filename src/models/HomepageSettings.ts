import mongoose, { Schema, Document, Model } from "mongoose";

export type HeroMode = "BOOKS" | "IMAGE" | "VIDEO";
export type HeroBackgroundAnimation = "NONE" | "SOFT_GRADIENT" | "FLOATING_LIGHT";

export interface IHomepageSettings extends Document {
  // ── Existing hero content fields ──────────────────────────────────────────
  heroImage?: string;
  heroImagePublicId?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroHighlightedText?: string;
  heroDescription?: string;
  primaryButtonText?: string;
  primaryButtonLink?: string;
  secondaryButtonText?: string;
  secondaryButtonLink?: string;
  isHeroEnabled: boolean;

  // ── New hero fields ───────────────────────────────────────────────────────
  /** Which visual to render on the right side of the hero */
  heroMode: HeroMode;

  /** Admin-selected book ObjectIds for BOOKS mode */
  heroBookIds: mongoose.Types.ObjectId[];

  /** Whether hero books auto-rotate */
  heroRotationEnabled: boolean;

  /** Rotation interval in ms (clamped 2500–15000) */
  heroRotationInterval: number;

  /** Cloudinary video URL for VIDEO mode */
  heroVideoUrl?: string;
  heroVideoPublicId?: string;

  /** Optional CSS background animation */
  heroBackgroundAnimation: HeroBackgroundAnimation;

  createdAt: Date;
  updatedAt: Date;
}

const HomepageSettingsSchema = new Schema<IHomepageSettings>(
  {
    // ── Existing fields ──────────────────────────────────────────────────────
    heroImage: { type: String, default: "" },
    heroImagePublicId: { type: String, default: "" },
    heroEyebrow: { type: String, default: "CURATED FOR YOU" },
    heroTitle: { type: String, default: "Discover Your Next Great Read" },
    heroHighlightedText: { type: String, default: "" },
    heroDescription: {
      type: String,
      default:
        "Explore carefully selected books across fiction, business, technology, self-growth and more.",
    },
    primaryButtonText: { type: String, default: "Browse Collection" },
    primaryButtonLink: { type: String, default: "/books" },
    secondaryButtonText: { type: String, default: "View Deals" },
    secondaryButtonLink: { type: String, default: "/books?sort=discount" },
    isHeroEnabled: { type: Boolean, default: true },

    // ── New fields ───────────────────────────────────────────────────────────
    heroMode: {
      type: String,
      enum: ["BOOKS", "IMAGE", "VIDEO"],
      default: "BOOKS",
    },
    heroBookIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Book",
      },
    ],
    heroRotationEnabled: { type: Boolean, default: true },
    heroRotationInterval: {
      type: Number,
      default: 4000,
      min: 2500,
      max: 15000,
    },
    heroVideoUrl: { type: String, default: "" },
    heroVideoPublicId: { type: String, default: "" },
    heroBackgroundAnimation: {
      type: String,
      enum: ["NONE", "SOFT_GRADIENT", "FLOATING_LIGHT"],
      default: "SOFT_GRADIENT",
    },
  },
  {
    timestamps: true,
  }
);

interface HomepageSettingsModel extends Model<IHomepageSettings> {
  getSettings(): Promise<IHomepageSettings>;
}

HomepageSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default (mongoose.models.HomepageSettings as HomepageSettingsModel) ||
  mongoose.model<IHomepageSettings, HomepageSettingsModel>(
    "HomepageSettings",
    HomepageSettingsSchema
  );
