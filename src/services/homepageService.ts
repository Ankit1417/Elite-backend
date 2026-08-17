import HomepageSettings, { IHomepageSettings } from "../models/HomepageSettings.js";

export async function getHomepageSettings() {
  let settings = await HomepageSettings.findOne();
  
  if (!settings) {
    settings = await HomepageSettings.create({});
  } else {
    // Ensure existing documents have default values for optional fields
    if (settings.heroImage === undefined || settings.heroImage === null) {
      settings.heroImage = "";
    }
    if (settings.heroImagePublicId === undefined || settings.heroImagePublicId === null) {
      settings.heroImagePublicId = "";
    }
    await settings.save({ validateBeforeSave: false });
  }
  
  return settings;
}

export async function updateHomepageSettings(data: Partial<IHomepageSettings>) {
  let settings = await HomepageSettings.findOne();
  
  if (!settings) {
    settings = await HomepageSettings.create(data);
  } else {
    // Ensure heroImage is never undefined to avoid validation errors
    if (data.heroImage === undefined) {
      data.heroImage = settings.heroImage || "";
    }
    if (data.heroImagePublicId === undefined) {
      data.heroImagePublicId = settings.heroImagePublicId || "";
    }
    
    Object.assign(settings, data);
    await settings.save({ validateBeforeSave: false });
  }
  return settings;
}
