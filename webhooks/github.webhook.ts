import axios from "axios";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { services } from "../schema/database/services.js";
import { getGithubToken } from "../utils/github.js";
import { redisConnection } from "../config/redis.js";

import type { Request, Response } from "express";

const GITHUB_API = "https://api.github.com";

type ServiceRow = typeof services.$inferSelect;
type HookTarget = Pick<ServiceRow, "repo_full_name" | "webhook_id">;

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function getGithubErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return `${error.response?.status} ${JSON.stringify(error.response?.data)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function isDuplicateHookError(error: unknown) {
  if (!axios.isAxiosError(error) || error.response?.status !== 422) {
    return false;
  }
  return JSON.stringify(error.response.data)
    .toLowerCase()
    .includes("already exists");
}

function getPublicApiUrl() {
  const base = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("PUBLIC_API_URL is not set");
  const host = new URL(base).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    throw new Error("PUBLIC_API_URL must be publicly reachable, not localhost");
  }
  return base;
}

function buildHookConfig(serviceId: string, secret: string) {
  return {
    url: `${getPublicApiUrl()}/webhooks/github/${serviceId}`,
    content_type: "json",
    secret,
    insecure_ssl: "0",
  };
}

async function reuseExistingHook(
  token: string,
  repoFullName: string,
  serviceId: string,
  secret: string,
) {
  const config = buildHookConfig(serviceId, secret);
  const list = await axios.get(`${GITHUB_API}/repos/${repoFullName}/hooks`, {
    headers: githubHeaders(token),
    params: { per_page: 100 },
  });
  const existing = list.data.find(
    (hook: any) => hook.config?.url?.replace(/\/$/, "") === config.url,
  );
  if (!existing)
    throw new Error("Webhook already exists but could not be found");

  await axios.patch(
    `${GITHUB_API}/repos/${repoFullName}/hooks/${existing.id}`,
    { active: true, events: ["push"], config },
    { headers: githubHeaders(token) },
  );
  return existing.id as number;
}

export async function createRepoWebhook(
  token: string,
  repoFullName: string,
  serviceId: string,
  secret: string,
) {
  try {
    const res = await axios.post(
      `${GITHUB_API}/repos/${repoFullName}/hooks`,
      {
        name: "web",
        active: true,
        events: ["push"],
        config: buildHookConfig(serviceId, secret),
      },
      { headers: githubHeaders(token) },
    );
    return res.data.id as number;
  } catch (error) {
    if (isDuplicateHookError(error)) {
      return reuseExistingHook(token, repoFullName, serviceId, secret);
    }
    throw error;
  }
}

export async function deleteRepoWebhook(
  token: string,
  repoFullName: string,
  hookId: number,
) {
  await axios.delete(`${GITHUB_API}/repos/${repoFullName}/hooks/${hookId}`, {
    headers: githubHeaders(token),
    validateStatus: (status) => status < 300 || status === 404,
  });
}

async function removeHookSafely(
  token: string,
  repoFullName: string,
  hookId: number,
) {
  try {
    await deleteRepoWebhook(token, repoFullName, hookId);
  } catch {
    return;
  }
}

async function disableAutoDeploy(serviceId: string) {
  await db
    .update(services)
    .set({ auto_deploy: false, webhook_id: null, webhook_secret: null })
    .where(eq(services.id, serviceId));
}

async function clearWebhook(serviceId: string) {
  await db
    .update(services)
    .set({ webhook_id: null, webhook_secret: null })
    .where(eq(services.id, serviceId));
}

export async function registerServiceWebhook(
  userId: string,
  service: ServiceRow,
) {
  const token = await getGithubToken(userId);

  if (!token || !service.repo_full_name) {
    await disableAutoDeploy(service.id);
    return false;
  }

  const secret = crypto.randomBytes(32).toString("hex");

  try {
    const hookId = await createRepoWebhook(
      token,
      service.repo_full_name,
      service.id,
      secret,
    );
    await db
      .update(services)
      .set({ webhook_id: hookId, webhook_secret: secret })
      .where(eq(services.id, service.id));
    return true;
  } catch (error) {
    console.error("Webhook register failed:", getGithubErrorMessage(error));
    await disableAutoDeploy(service.id);
    return false;
  }
}

export async function syncServiceWebhook(
  userId: string,
  prev: ServiceRow,
  next: ServiceRow,
) {
  const repoChanged = prev.repo_full_name !== next.repo_full_name;
  let hasHook = !!prev.webhook_id;

  if (prev.webhook_id && prev.repo_full_name && repoChanged) {
    const token = await getGithubToken(userId);
    if (token) {
      await removeHookSafely(token, prev.repo_full_name, prev.webhook_id);
    }
    await clearWebhook(prev.id);
    hasHook = false;
  }

  if (next.auto_deploy && next.repo_full_name && !hasHook) {
    return registerServiceWebhook(userId, next);
  }

  return true;
}

export async function removeServiceWebhooks(
  userId: string,
  rows: HookTarget[],
) {
  const targets = rows.filter((row) => row.webhook_id && row.repo_full_name);
  if (targets.length === 0) return;

  const token = await getGithubToken(userId);
  if (!token) return;

  await Promise.all(
    targets.map((row) =>
      removeHookSafely(token, row.repo_full_name!, row.webhook_id!),
    ),
  );
}

import { DeployService } from "../service/deploy.service.js";
import { DEPLOY_TRIGGER } from "../constants.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verifySignature(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string | undefined,
) {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function isNewDelivery(deliveryId: string | undefined) {
  if (!deliveryId) return true;
  const result = await redisConnection.set(
    `gh_delivery:${deliveryId}`,
    "1",
    "EX",
    86400,
    "NX",
  );
  return result === "OK";
}

export async function GithubWebhook(req: Request, res: Response) {
  const serviceId = req.params.service_id as string;

  if (!UUID_REGEX.test(serviceId)) return res.sendStatus(404);
  if (!Buffer.isBuffer(req.body)) return res.sendStatus(400);

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId));

  if (!service || !service.webhook_secret) return res.sendStatus(404);

  const isValid = verifySignature(
    req.body,
    service.webhook_secret,
    req.header("x-hub-signature-256"),
  );
  if (!isValid) return res.sendStatus(401);

  const event = req.header("x-github-event");
  if (event === "ping") return res.sendStatus(200);
  if (event !== "push") return res.sendStatus(204);

  let payload: any;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }

  if (!service.enabled || !service.auto_deploy) return res.sendStatus(204);
  if (payload.deleted) return res.sendStatus(204);
  if (payload.ref !== `refs/heads/${service.branch}`)
    return res.sendStatus(204);
  if (
    payload.repository?.full_name?.toLowerCase() !==
    service.repo_full_name?.toLowerCase()
  ) {
    return res.sendStatus(204);
  }

  const isNew = await isNewDelivery(req.header("x-github-delivery"));
  if (!isNew) return res.sendStatus(200);

  try {
    await DeployService({
      user_id: service.user_id,
      project_id: service.project_id,
      service_id: service.id,
      deploy_type: service.deploy_type,
      trigger_type: DEPLOY_TRIGGER.AUTO,
    });
    return res.sendStatus(202);
  } catch {
    return res.sendStatus(500);
  }
}
