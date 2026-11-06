import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import Routes from "./routes/index.route.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { ensureDatabase } from "./config/ensure-db.js";
import { db } from "./config/db.js";
import { ConnectRedis, DisconnectRedis } from "./config/redis.js";
dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;

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

async function start() {
  await ConnectRedis();
  await ensureDatabase();
  await migrate(db, { migrationsFolder: "./migrations" });

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  async function shutdown() {
    server.close();
    await DisconnectRedis();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch(function (err) {
  console.error("Startup failed", err);
  process.exit(1);
});
