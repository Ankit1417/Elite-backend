import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { FRONTEND_URL, NODE_ENV } from "./config/env.js";
import { errorHandler } from "./middleware/errorMiddleware.js";
import routes from "./routes/index.js";

const app = express();

// Trust first proxy for Render / HTTPS reverse proxies
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some((allowed) => {
        if (!allowed) return false;
        const normAllowed = allowed.replace(/\/+$/, "");
        const normOrigin = origin.replace(/\/+$/, "");
        return normAllowed === normOrigin;
      });

      if (isAllowed) {
        return callback(null, true);
      }

      if (
        NODE_ENV !== "production" &&
        (origin.includes("localhost") || origin.includes("127.0.0.1"))
      ) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    success: true,
    message: "Elite Library API is running smoothly",
  });
});

app.use("/api", routes);

app.use((_request, response) => {
  response.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use(errorHandler);

export default app;
