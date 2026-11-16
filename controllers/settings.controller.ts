import axios from "axios";
import { eq, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../config/db.js";
import { services } from "../schema/database/services.js";
import { users } from "../schema/database/user.js";
import { resyncUserWebhooks } from "../webhooks/github.webhook.js";
import { getGithubToken } from "../utils/github.js";
import { send_error, send_success } from "../utils/response.js";

async function getGithubStatus(userId: string) {
  const token = await getGithubToken(userId);

  if (!token) {
    return {
      connected: false,
      valid: false,
      login: null,
      avatar_url: null,
      scopes: [] as string[],
    };
  }

  try {
    const res = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const scopes = String(res.headers["x-oauth-scopes"] ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);

    return {
      connected: true,
      valid: true,
      login: res.data.login as string,
      avatar_url: res.data.avatar_url as string,
      scopes,
    };
  } catch {
    return {
      connected: true,
      valid: false,
      login: null,
      avatar_url: null,
      scopes: [] as string[],
    };
  }
}

function isWebhookReady() {
  const base = process.env.PUBLIC_API_URL;
  if (!base) return false;
  try {
    const host = new URL(base).hostname;
    return !["localhost", "127.0.0.1", "0.0.0.0"].includes(host);
  } catch {
    return false;
  }
}

export async function GetSettings(req: Request, res: Response) {
  const userId = req.user!.id;

  const [[account], github, [serviceStats]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        created_on: users.created_on,
      })
      .from(users)
      .where(eq(users.id, userId)),
    getGithubStatus(userId),
    db
      .select({
        total: sql<number>`count(*)::int`,
        auto_deploy: sql<number>`count(*) filter (where ${services.auto_deploy} = true)::int`,
        webhooks: sql<number>`count(${services.webhook_id})::int`,
      })
      .from(services)
      .where(eq(services.user_id, userId)),
  ]);

  if (!account) return send_error(res, 404, "User not found !");

  return send_success(res, 200, {
    account,
    github,
    platform: {
      public_api_url: process.env.PUBLIC_API_URL ?? null,
      webhook_ready: isWebhookReady(),
      services: serviceStats,
    },
  });
}

export async function DisconnectGithub(req: Request, res: Response) {
  const userId = req.user!.id;

  await db
    .update(users)
    .set({ github_token: null })
    .where(eq(users.id, userId));

  await db
    .update(services)
    .set({ auto_deploy: false })
    .where(eq(services.user_id, userId));

  return send_success(res, 200, null, "GitHub disconnected !");
}

export async function ResyncWebhooks(req: Request, res: Response) {
  const userId = req.user!.id;

  const github = await getGithubStatus(userId);
  if (!github.valid) {
    return send_error(res, 400, "Reconnect GitHub first");
  }

  const result = await resyncUserWebhooks(userId);
  return send_success(
    res,
    200,
    result,
    `${result.registered} webhook(s) registered, ${result.failed} failed`,
  );
}
