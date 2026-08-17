import mongoose from "mongoose";

import { MONGODB_URI } from "./env.js";

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  console.log("MongoDB connection closed");
}
