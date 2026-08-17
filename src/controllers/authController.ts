import { Request, Response } from "express";
import { loginAdmin, logoutAdmin } from "../services/authService.js";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";

export const handleAdminLogin = asyncHandler(
  async (req: Request, res: Response) => {
    const { identifier, password } = req.body;
    
    if (!identifier || !password) {
      throw new Error("Identifier and password are required");
    }
    
    const result = await loginAdmin(identifier, password, res);
    return sendSuccess(res, result, 200, "Logged in successfully");
  }
);

export const handleAdminLogout = asyncHandler(
  async (_req: Request, res: Response) => {
    logoutAdmin(res);
    return sendSuccess(res, null, 200, "Logged out successfully");
  }
);

export const handleGetMe = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    return sendSuccess(res, req.admin, 200);
  }
);
