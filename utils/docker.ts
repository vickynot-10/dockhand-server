import Docker from "dockerode";
import type { RunContainerOptions } from "../types/deploy.types.js";
import { config } from "dotenv";
import { MEMORY_LIMIT_MB } from "../constants.js";

config();
const docker = new Docker();
const STABLE_MS = 8000;
const NETWORK = process.env.DEPLOY_NETWORK ?? "web";

const MEMORY_LIMIT = MEMORY_LIMIT_MB * 1024 * 1024; // 256 MB
// docker.io/library/nginx:latest -> nginx:latest else nginx:latest
function NormalizeDockerImageString(image: string) {
  const img_str = image.split("/").pop() ?? image;
  if (img_str.includes(":") || img_str.includes("@")) return image;
  return `${image}:latest`;
}

export async function IsImageExists(image: string) {
  try {
    await docker.getImage(image).inspect();
    return true;
  } catch (err: any) {
    if (err.statusCode === 404) return false;
    throw err;
  }
}

export async function PingDocker() {
  await docker.ping();
}

export function PullImage(image: string) {
  return new Promise<void>((resolve, reject) => {
    const img = NormalizeDockerImageString(image);
    docker.pull(img, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (error: Error | null) => {
        if (error) return reject(error);
        resolve();
      });
    });
  });
}

export async function GetImage(image: string): Promise<string> {
  const img = NormalizeDockerImageString(image);
  const info = await docker.getImage(img).inspect();
  return info.RepoDigests?.[0] ?? img;
}

export async function RunContainer(options: RunContainerOptions) {
  const container = await docker.createContainer({
    name: options.name,
    Image: options.image,
    Labels: {
      "traefik.enable": "true",
      "traefik.docker.network": NETWORK,
      [`traefik.http.routers.${options.slug}.rule`]: `Host(\`${options.hostname}\`)`,
      [`traefik.http.routers.${options.slug}.entrypoints`]: "web",
      [`traefik.http.services.${options.slug}.loadbalancer.server.port`]:
        String(options.port),
    },
    Env: [
      `PORT=${options.port}`,
      ...(options.env_vars ?? []).map((item) => {
        return `${item.key}=${item.value}`;
      }),
    ],
    HostConfig: {
      NetworkMode: NETWORK,
      RestartPolicy: { Name: "unless-stopped" },
      Memory: MEMORY_LIMIT,
      MemorySwap: MEMORY_LIMIT,
    },
  });

  await container.start();

  return container.id;
}

export async function RemoveContainer(name: string) {
  try {
    await docker.getContainer(name).remove({ force: true });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== 404) throw error;
  }
}

function IgnoreStatus(error: unknown, codes: number[]) {
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (!statusCode || !codes.includes(statusCode)) throw error;
}

export async function StopContainers(container_name: string) {
  try {
    await docker.getContainer(container_name).stop({ t: 10 });
  } catch (error) {
    IgnoreStatus(error, [304]);
  }
}

export async function StartContainers(container_name: string) {
  try {
    await docker.getContainer(container_name).start();
  } catch (error) {
    IgnoreStatus(error, [304]);
  }
}

function Sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
async function ApiCall(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

type HealthOptions = {
  name: string;
  port: number;
  path?: string;
  timeout_ms?: number;
  interval_ms?: number;
};

type HealthResult = {
  healthy: boolean;
  reason: string | null;
};

export async function HealthCheckCOntainer(
  options: HealthOptions,
): Promise<HealthResult> {
  const {
    name,
    port,
    path = "/",
    timeout_ms = 60000,
    interval_ms = 1500,
  } = options;

  const startedAt = Date.now();
  const deadline = startedAt + timeout_ms;
  const canProbe = process.platform === "linux";

  while (Date.now() < deadline) {
    const info = await docker.getContainer(name).inspect();

    if (!info.State.Running || info.State.Restarting || info.RestartCount > 0) {
      return {
        healthy: false,
        reason: `Container exited with code ${info.State.ExitCode}`,
      };
    }

    if (canProbe) {
      const ip = info.NetworkSettings.Networks?.[NETWORK]?.IPAddress;
      if (ip && (await ApiCall(`http://${ip}:${port}${path}`))) {
        return { healthy: true, reason: null };
      }
    } else if (Date.now() - startedAt >= STABLE_MS) {
      return { healthy: true, reason: null };
    }

    await Sleep(interval_ms);
  }
  return {
    healthy: false,
    reason: `Health check failed after ${timeout_ms / 1000}s on port ${port}`,
  };
}
