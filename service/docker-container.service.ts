import Docker from "dockerode";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../config/db.js";
import { deployments } from "../schema/database/deployments.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { emitter } from "../utils/emitter.js";

const docker = new Docker();

type DockerEvent = {
  Action?: string;
  Actor?: { Attributes?: { name?: string } };
};

async function SetStatus(container_name: string, from: number, to: number) {
  const rows = await db
    .update(deployments)
    .set({ status: to })
    .where(
      and(
        eq(deployments.container_name, container_name),
        eq(deployments.status, from),
      ),
    )
    .returning();

  for (const row of rows) {
    emitter.to(`service:${row.service_id}`).emit("deployment_status", {
      deployment_id: row.id,
      status: to,
    });
  }
}

async function HandleEvent(event: DockerEvent) {
  const container_name = event.Actor?.Attributes?.name;
  if (!container_name) return;

  if (event.Action === "die") {
    await SetStatus(
      container_name,
      DEPLOYMENT_STATUS.RUNNING,
      DEPLOYMENT_STATUS.STOPPED,
    );
  } else if (event.Action === "start") {
    await SetStatus(
      container_name,
      DEPLOYMENT_STATUS.STOPPED,
      DEPLOYMENT_STATUS.RUNNING,
    );
  }
}

export async function ReconcileStatuses() {
  const rows = await db
    .select()
    .from(deployments)
    .where(
      and(
        isNotNull(deployments.container_name),
        inArray(deployments.status, [
          DEPLOYMENT_STATUS.RUNNING,
          DEPLOYMENT_STATUS.STOPPED,
        ]),
      ),
    );

  for (const row of rows) {
    if (!row.container_name) continue;
    let is_running = false;
    try {
      const info = await docker.getContainer(row.container_name).inspect();
      is_running = info.State.Running;
    } catch {
      is_running = false;
    }
    const next = is_running
      ? DEPLOYMENT_STATUS.RUNNING
      : DEPLOYMENT_STATUS.STOPPED;
    if (next !== row.status) {
      await SetStatus(row.container_name, row.status, next);
    }
  }
}

export async function WatchContainerEvents() {
  const stream = await docker.getEvents({
    filters: { type: ["container"], event: ["start", "die"] },
  });

  let buffer = "";
  let retry_scheduled = false;

  function Retry() {
    if (retry_scheduled) return;
    retry_scheduled = true;
    setTimeout(() => {
      retry_scheduled = false;
      WatchContainerEvents().catch(Retry);
    }, 2000);
  }

  stream.on("data", function (chunk: Buffer) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        HandleEvent(JSON.parse(line)).catch(function () {});
      } catch {
        continue;
      }
    }
  });

  stream.on("error", Retry);
  stream.on("end", Retry);
}
