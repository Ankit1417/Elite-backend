import { Request, Response } from "express";
import { PaymentSettings } from "../models/PaymentSettings.js";
import { AuthenticatedRequest } from "../types/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/response.js";
import { DELIVERY_FEE } from "../config/env.js";
import { AppError } from "../utils/appError.js";

const PAYMENT_SETTINGS_SINGLETON_ID = "000000000000000000000001";

function serializePaymentSettings(settings?: {
  cashOnDeliveryEnabled: boolean;
  esewaEnabled: boolean;
} | null) {
  const cod = settings?.cashOnDeliveryEnabled ?? true;
  const esewa = settings?.esewaEnabled ?? false;
  return {
    cod,
    esewa,
    // Preserve the original admin settings contract while checkout uses the
    // shorter aliases above.
    cashOnDeliveryEnabled: cod,
    esewaEnabled: esewa,
    deliveryFee: DELIVERY_FEE,
  };
}

export const getPaymentSettings = asyncHandler(
  async (_req: Request, res: Response) => {
    const settings = await PaymentSettings.findOne();

    return sendSuccess(
      res,
      serializePaymentSettings(settings),
      200
    );
  }
);

export const updatePaymentSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { cashOnDeliveryEnabled, esewaEnabled } = req.body;

    if (typeof cashOnDeliveryEnabled !== "boolean" || typeof esewaEnabled !== "boolean") {
      throw new AppError("Invalid payment settings values", 400);
    }
    if (!cashOnDeliveryEnabled && !esewaEnabled) {
      throw new AppError("At least one payment method must be enabled", 400);
    }

    let settings = await PaymentSettings.findOne();

    if (!settings) {
      settings = await PaymentSettings.findByIdAndUpdate(
        PAYMENT_SETTINGS_SINGLETON_ID,
        { $set: { cashOnDeliveryEnabled, esewaEnabled } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } else {
      settings.cashOnDeliveryEnabled = cashOnDeliveryEnabled;
      settings.esewaEnabled = esewaEnabled;
      await settings.save();
    }

    if (!settings) {
      throw new AppError("Payment settings could not be updated", 500);
    }

    return sendSuccess(
      res,
      serializePaymentSettings(settings),
      200,
      "Payment settings updated successfully"
    );
  }
);
