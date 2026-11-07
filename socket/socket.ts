import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { parseCookie } from "cookie";
import { and, eq } from "drizzle-orm";
import { redisConnection } from "../config/redis.js";
import { deployments } from "../schema/database/deployments.js";
import { db } from "../config/db.js";
import { decryptToken } from "../libs/jwt.js";
import { COOKIE } from "../constants.js";
import { services } from "../schema/database/services.js";

const CAN_ACCESS_HM = new Map<string, boolean>();

setInterval(
  () => {
    CAN_ACCESS_HM.clear();
  },
  5 * 60 * 1000,
); // 1hour
export function InitSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  io.adapter(
    createAdapter(redisConnection.duplicate(), redisConnection.duplicate()),
  );

  io.use((socket, next) => {
    const rawCookie = socket.handshake.headers.cookie;

    if (!rawCookie) return next(new Error("Unauthorized"));

    const token = parseCookie(rawCookie)[COOKIE];

    if (!token) return next(new Error("Unauthorized"));

    const decoded: any = decryptToken(token);

    if (!decoded?.id) return next(new Error("Unauthorized"));

    socket.data.user_id = decoded?.id;

    next();
  });

  io.on("connection", (socket) => {
    socket.on("join_service", async function (service_id: string) {
      const allowed = await CanAccessService(socket.data.user_id, service_id);
      if (!allowed) return;
      socket.join(`service:${service_id}`);
    });

    socket.on("join_deployment", async (deployment_id: string) => {
      const allowed = await CanAccessDeployment(
        socket.data.user_id,
        deployment_id,
      );
      if (!allowed) return;
      socket.join(`deployment:${deployment_id}`);
    });

    socket.on("leave", function (room: string) {
      socket.leave(room);
    });
  });

  return io;
}

async function CanAccessService(user_id: string, service_id: string) {
  const KEY = `${user_id}:${service_id}`;
  if (CAN_ACCESS_HM.has(KEY)) {
    return CAN_ACCESS_HM.get(KEY);
  }
  const [row] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.user_id, user_id), eq(services.id, service_id)));
  const isTrueOrFalse = Boolean(row);

  CAN_ACCESS_HM.set(KEY, isTrueOrFalse);

  return isTrueOrFalse;
}

async function CanAccessDeployment(user_id: string, deployment_id: string) {
  const KEY = `${user_id}:${deployment_id}`;
  if (CAN_ACCESS_HM.has(KEY)) {
    return CAN_ACCESS_HM.get(KEY);
  }

  const [row] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(
      and(eq(deployments.user_id, user_id), eq(deployments.id, deployment_id)),
    );
  const isTrueOrFalse = Boolean(row);

  CAN_ACCESS_HM.set(KEY, isTrueOrFalse);

  return isTrueOrFalse;
}
