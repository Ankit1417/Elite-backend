import { Request, Response } from "express";
import { getHomepageSettings, updateHomepageSettings } from "../services/homepageService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

export const handleGetHomepageSettings = asyncHandler(
  async (_req: Request, res: Response) => {
    const settings = await getHomepageSettings();
    return sendSuccess(res, settings);
  }
);

export const handleUpdateHomepageSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const settings = await updateHomepageSettings(req.body);
    return sendSuccess(res, settings, 200, "Homepage settings updated successfully");
  }
);
