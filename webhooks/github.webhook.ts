import axios from "axios";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { services } from "../schema/database/services.js";
import { getGithubToken } from "../utils/github.js";

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

function buildHookConfig(serviceId: string, secret: string) {
  return {
    url: `${process.env.PUBLIC_API_URL}/webhooks/github/${serviceId}`,
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
  });
  const existing = list.data.find(
    (hook: any) => hook.config?.url === config.url,
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
    if (axios.isAxiosError(error) && error.response?.status === 422) {
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
  } catch {
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
