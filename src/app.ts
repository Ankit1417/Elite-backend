import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { FRONTEND_URL } from "./config/env.js";
import { errorHandler } from "./middleware/errorMiddleware.js";
import routes from "./routes/index.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: FRONTEND_URL,
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
