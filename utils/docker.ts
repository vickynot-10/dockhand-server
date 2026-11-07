import Docker from "dockerode";
import type { RunContainerOptions } from "../types/deploy.types.js";
import { config } from "dotenv";
import { MEMORY_LIMIT_MB } from "../constants.js";

config();
const docker = new Docker();

const NETWORK = process.env.DEPLOY_NETWORK ?? "web";

const MEMORY_LIMIT = MEMORY_LIMIT_MB * 1024 * 1024; // 256 MB
// docker.io/library/nginx:latest -> nginx:latest else nginx:latest
function NormalizeDockerImageString(image: string) {
  const img_str = image.split("/").pop() ?? image;
  if (img_str.includes(":") || img_str.includes("@")) return image;
  return `${image}:latest`;
}

export async function PingDocker() {
  await docker.ping();
}

export function PullImage(image: string) {
  return new Promise<void>((resolve, reject) => {
    const img = NormalizeDockerImageString(image);
    docker.pull(img, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (error: Error | null, result) => {
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
