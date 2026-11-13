import Docker from "dockerode";
import type {
  HealthOptions,
  HealthResult,
  RunContainerOptions,
} from "../types/deploy.types.js";
import { config } from "dotenv";
import { MEMORY_LIMIT_MB } from "../constants.js";
import { GetEntrypoint } from "./domain.js";

config();
const docker = new Docker();
const STABLE_MS = 8000;

const MEMORY_LIMIT = MEMORY_LIMIT_MB * 1024 * 1024;

function NormalizeDockerImageString(image: string) {
  const img_str = image.split("/").pop() ?? image;
  if (img_str.includes(":") || img_str.includes("@")) return image;
  return `${image}:latest`;
}

function CreateNetworkName(project_id: string): string {
  return `project_${project_id}_network`;
}

export const TRAEFIK_CONTAINER =
  process.env.TRAEFIK_CONTAINER ?? "traefik-traefik-1";

async function ConnectToNetwork(network: string) {
  try {
    await docker.getNetwork(network).connect({ Container: TRAEFIK_CONTAINER });
  } catch (e: any) {
    if (e.statusCode === 403) return;
    if (e.statusCode === 404) {
      throw new Error(`Traefik container "${TRAEFIK_CONTAINER}" not found`);
    }
    throw e;
  }
}

export async function ReconnectTraefik() {
  const networks = await docker.listNetworks({
    filters: { label: ["dockhand.projects"] },
  });
  const results = await Promise.allSettled(
    networks.map((n) => ConnectToNetwork(n.Name)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Traefik reconnect failed", result.reason);
    }
  }
}

async function CreateNetwork(project_id: string) {
  const NETWORK_NAME = CreateNetworkName(project_id);
  try {
    await docker.createNetwork({
      Name: NETWORK_NAME,
      Driver: "bridge",
      CheckDuplicate: true,
      Labels: { "dockhand.projects": project_id },
    });
  } catch (e: any) {
    if (e.statusCode !== 409) throw e;
  }

  return NETWORK_NAME;
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
  const {
    project_id,
    service_name,
    name,
    image,
    slug,
    hostname,
    port,
    env_vars,
  } = options;
  const NETWORK = await CreateNetwork(project_id);

  const container = await docker.createContainer({
    name,
    Image: image,
    Labels: {
      "traefik.enable": "true",
      "traefik.docker.network": NETWORK,
      [`traefik.http.routers.${slug}.rule`]: `Host(\`${hostname}\`)`,
      [`traefik.http.routers.${slug}.entrypoints`]: GetEntrypoint(),
      [`traefik.http.services.${slug}.loadbalancer.server.port`]: String(port),
    },
    Env: [
      ...(env_vars ?? []).map((item) => `${item.key}=${item.value}`),
      `PORT=${port}`,
    ],
    HostConfig: {
      NetworkMode: NETWORK,
      RestartPolicy: { Name: "unless-stopped" },
      Memory: MEMORY_LIMIT,
      MemorySwap: MEMORY_LIMIT,
      PidsLimit: 512,
      SecurityOpt: ["no-new-privileges"],
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [NETWORK]: { Aliases: [service_name] },
      },
    },
  });

  await ConnectToNetwork(NETWORK);

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

export async function HealthCheckCOntainer(
  options: HealthOptions,
): Promise<HealthResult> {
  const {
    name,
    port,
    path = "/",
    timeout_ms = 60000,
    interval_ms = 1500,
    project_id,
  } = options;

  const NETWORK = CreateNetworkName(project_id);

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
