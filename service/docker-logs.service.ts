import Docker from "dockerode";
import { PassThrough } from "stream";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../config/db.js";
import { deployments } from "../schema/database/deployments.js";
import { serviceLogs } from "../schema/database/service-logs.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { detectLevel, type LogLevel } from "../utils/logLevel.js";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const FLUSH_MS = 1000;
const FLUSH_SIZE = 500;
const MAX_BUFFER = 5000;
const MAX_LINE = 8000;

type Row = typeof serviceLogs.$inferInsert;
type Target = {
  deployment_id: string;
  service_id: string;
  container_name: string;
};

const followers = new Map<string, { stop: () => void }>();
let buffer: Row[] = [];
let isFlushing = false;

async function flushBuffer() {
  if (isFlushing || buffer.length === 0) return;
  isFlushing = true;
  const batch = buffer;
  buffer = [];
  try {
    await db.insert(serviceLogs).values(batch);
  } catch {
    buffer = [...batch, ...buffer].slice(-MAX_BUFFER);
  } finally {
    isFlushing = false;
  }
}

function pushRow(row: Row) {
  buffer.push(row);
  if (buffer.length >= FLUSH_SIZE) void flushBuffer();
}

function makeLineSink(
  target: Target,
  lastTs: { value: number },
  stream: "stdout" | "stderr",
) {
  const sink = new PassThrough();
  let pending = "";
  let previousLevel: LogLevel | null = null;

  sink.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    for (const raw of parts) {
      if (!raw) continue;
      const space = raw.indexOf(" ");
      const ts = new Date(raw.slice(0, space));
      if (Number.isNaN(ts.getTime()) || ts.getTime() < lastTs.value) continue;
      lastTs.value = ts.getTime();
      const message = raw.slice(space + 1, space + 1 + MAX_LINE);
      const level = detectLevel(message, previousLevel);
      previousLevel = level;
      pushRow({
        service_id: target.service_id,
        deployment_id: target.deployment_id,
        ts,
        stream,
        level,
        message,
      });
    }
  });

  return sink;
}

async function getResumePoint(serviceId: string) {
  const [last] = await db
    .select({ ts: serviceLogs.ts })
    .from(serviceLogs)
    .where(eq(serviceLogs.service_id, serviceId))
    .orderBy(desc(serviceLogs.id))
    .limit(1);
  return last?.ts ?? null;
}

export async function startFollowing(target: Target) {
  if (followers.has(target.deployment_id)) return;

  const resume = await getResumePoint(target.service_id);
  const lastTs = { value: resume ? resume.getTime() + 1 : 0 };
  let isStopped = false;
  let logStream: NodeJS.ReadableStream | null = null;

  function stop() {
    isStopped = true;
    followers.delete(target.deployment_id);
    (logStream as any)?.destroy?.();
  }

  followers.set(target.deployment_id, { stop });

  async function connect(attempt: number) {
    if (isStopped) return;
    try {
      const container = docker.getContainer(target.container_name);
      const info = await container.inspect();
      if (!info.State.Running) return stop();

      const since = lastTs.value ? Math.floor(lastTs.value / 1000) : 0;
      logStream = (await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
        since,
      })) as NodeJS.ReadableStream;

      const out = makeLineSink(target, lastTs, "stdout");
      const err = makeLineSink(target, lastTs, "stderr");
      docker.modem.demuxStream(logStream, out, err);

      logStream.on("end", () => void connect(0));
      logStream.on("error", () =>
        setTimeout(
          () => void connect(attempt + 1),
          Math.min(30000, 1000 * 2 ** attempt),
        ),
      );
    } catch {
      if (attempt >= 5) return stop();
      setTimeout(
        () => void connect(attempt + 1),
        Math.min(30000, 1000 * 2 ** attempt),
      );
    }
  }

  await connect(0);
}

export function stopFollowing(deploymentId: string) {
  followers.get(deploymentId)?.stop();
}

export async function syncFollowers() {
  const running = await db
    .select({
      deployment_id: deployments.id,
      service_id: deployments.service_id,
      container_name: deployments.container_name,
    })
    .from(deployments)
    .where(
      and(
        isNotNull(deployments.container_name),
        inArray(deployments.status, [DEPLOYMENT_STATUS.RUNNING]),
      ),
    );

  const runningIds = new Set(running.map((item) => item.deployment_id));

  for (const id of followers.keys()) {
    if (!runningIds.has(id)) stopFollowing(id);
  }
  for (const item of running) {
    await startFollowing({ ...item, container_name: item.container_name! });
  }
}

export async function startLogCollector() {
  setInterval(() => void flushBuffer(), FLUSH_MS);
  await syncFollowers();
  setInterval(() => void syncFollowers(), 30000);
}
