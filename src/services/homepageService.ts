import HomepageSettings, { IHomepageSettings } from "../models/HomepageSettings.js";

const MIN_INTERVAL = 2500;
const MAX_INTERVAL = 15000;
const MAX_HERO_BOOKS = 8;

/**
 * Fetch homepage settings, populating heroBookIds with essential book fields.
 * Returns a plain object so the populated books are serialisable.
 */
export async function getHomepageSettings() {
  let settings = await HomepageSettings.findOne().populate(
    "heroBookIds",
    "title slug author coverImage finalPrice price discountPercentage averageRating reviewCount stockQuantity"
  );

  if (!settings) {
    settings = await HomepageSettings.create({});
    // Re-fetch with population
    const populated = await HomepageSettings.findById(settings._id).populate(
      "heroBookIds",
      "title slug author coverImage finalPrice price discountPercentage averageRating reviewCount stockQuantity"
    );
    return populated!;
  }

  // Back-fill any fields that may be missing in older documents
  let dirty = false;
  if (settings.heroImage === undefined || settings.heroImage === null) {
    settings.heroImage = "";
    dirty = true;
  }
  if (settings.heroImagePublicId === undefined || settings.heroImagePublicId === null) {
    settings.heroImagePublicId = "";
    dirty = true;
  }
  if (dirty) {
    await settings.save({ validateBeforeSave: false });
  }

  return settings;
}

export async function updateHomepageSettings(data: Partial<IHomepageSettings>) {
  let settings = await HomepageSettings.findOne();

  if (!settings) {
    settings = await HomepageSettings.create(data);
  } else {
    // Preserve image fields if not explicitly provided
    if (data.heroImage === undefined) {
      data.heroImage = settings.heroImage || "";
    }
    if (data.heroImagePublicId === undefined) {
      data.heroImagePublicId = settings.heroImagePublicId || "";
    }

    // Clamp rotation interval
    if (data.heroRotationInterval !== undefined) {
      data.heroRotationInterval = Math.min(
        MAX_INTERVAL,
        Math.max(MIN_INTERVAL, data.heroRotationInterval)
      );
    }

    // Cap hero book selection
    if (Array.isArray(data.heroBookIds) && data.heroBookIds.length > MAX_HERO_BOOKS) {
      data.heroBookIds = data.heroBookIds.slice(0, MAX_HERO_BOOKS);
    }

    Object.assign(settings, data);
    await settings.save({ validateBeforeSave: false });
  }

  // Return with books populated
  return HomepageSettings.findById(settings._id).populate(
    "heroBookIds",
    "title slug author coverImage finalPrice price discountPercentage averageRating reviewCount stockQuantity"
  );
}
