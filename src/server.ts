import type { Server } from "node:http";

import app from "./app.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";
import { MONGODB_URI, PORT, NODE_ENV, logEnvironmentDiagnostics } from "./config/env.js";
import { testCloudinaryAuth } from "./config/cloudinary.js";
import { startBirthdayScheduler } from "./services/birthdaySchedulerService.js";

let isShuttingDown = false;
let stopBirthdayScheduler: (() => void) | undefined;

function getSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";

  return message
    .replaceAll(MONGODB_URI, "[redacted MongoDB URI]")
    .replace(
      /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
      "mongodb://[redacted connection details]",
    );
}

function startHttpServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT);

    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

async function shutdown(signal: NodeJS.Signals, server: Server): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown...`);
  stopBirthdayScheduler?.();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await disconnectDatabase();
    console.log("Elite Library API shut down successfully");
    process.exit(0);
  } catch (error) {
    console.error(
      "Elite Library API shutdown failed:",
      getSafeErrorMessage(error),
    );
    process.exit(1);
  }
}

async function startServer(): Promise<void> {
  logEnvironmentDiagnostics();
  await connectDatabase();
  const server = await startHttpServer();
  stopBirthdayScheduler = startBirthdayScheduler();

  console.log(`Elite Library API is running on port ${PORT}`);

  // This verifies the credentials only. Upload permissions are checked by
  // Cloudinary separately when an asset is created.
  if (NODE_ENV === "development") {
    console.log("Running Cloudinary authentication test...");
    const authTest = await testCloudinaryAuth();
    if (authTest.success) {
      console.log(
        "Cloudinary credentials authenticated (asset permissions are checked during upload)"
      );
    } else {
      console.log("Cloudinary auth test FAILED:", {
        error: authTest.error,
        httpCode: authTest.httpCode,
      });
    }
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT", server);
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", server);
  });
}

startServer().catch(async (error: unknown) => {
  stopBirthdayScheduler?.();
  console.error(
    "Elite Library API startup failed:",
    getSafeErrorMessage(error),
  );

  try {
    await disconnectDatabase();
  } catch (disconnectError) {
    console.error(
      "MongoDB cleanup after startup failure failed:",
      getSafeErrorMessage(disconnectError),
    );
  }

  process.exit(1);
});
