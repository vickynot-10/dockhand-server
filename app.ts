import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import Routes from "./routes/index.route.js";

dotenv.config();

import { ensureDatabase } from "./config/ensure-db.js";

const app = express();

const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
  });
});

app.use("/api", Routes);
ensureDatabase();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
