import { Redis } from "ioredis";

const redisURL = process.env.REDIS_URL;

if (!redisURL) throw new Error("Redis URL is not Set");

export const redisConnection = new Redis(redisURL, {
  maxRetriesPerRequest: null,
});

export async function ConnectRedis() {
  const reply = await redisConnection.ping();
  if (reply !== "PONG") {
    throw new Error("Redis connection failed");
  }
  console.log("Redis Connected");
}

export async function DisconnectRedis() {
  await redisConnection.quit();
}

redisConnection.on("connect", () => {
  console.log("Redis Connected from on event");
});

redisConnection.on("error", (error) => {
  console.error("Redis error:", error.message);
});
