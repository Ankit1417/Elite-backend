import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHomepageSettings extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const HomepageSettingsSchema = new Schema<IHomepageSettings>(
  {
    heroImage: {
      type: String,
      default: "",
    },
    heroImagePublicId: {
      type: String,
      default: "",
    },
    heroEyebrow: {
      type: String,
      default: "Curated Sanctuary",
    },
    heroTitle: {
      type: String,
      default: "Timeless Literature,",
    },
    heroHighlightedText: {
      type: String,
      default: "Delivered to Your Library",
    },
    heroDescription: {
      type: String,
      default: "Discover our carefully curated collection of premium books, from timeless classics to contemporary masterpieces.",
    },
    primaryButtonText: {
      type: String,
      default: "Explore Collection",
    },
    primaryButtonLink: {
      type: String,
      default: "/books",
    },
    secondaryButtonText: {
      type: String,
      default: "Special Offerings",
    },
    secondaryButtonLink: {
      type: String,
      default: "/books?isFeatured=true",
    },
    isHeroEnabled: {
      type: Boolean,
      default: true,
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
  mongoose.model<IHomepageSettings, HomepageSettingsModel>("HomepageSettings", HomepageSettingsSchema);
