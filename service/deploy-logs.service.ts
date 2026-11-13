import { db } from "../config/db.js";
import { deployment_logs } from "../schema/database/deploy-logs.js";
import { emitter } from "../utils/emitter.js";

type LogLine = { stream: string; line: string; ts: string };

const FLUSH_INTERVAL_MS = 1000;
const MAX_BATCH = 50;
const MAX_LINE_LENGTH = 4000;
const MAX_TOTAL_LINES = 20000;

export async function InsertLogs(
  deployment_id: string,
  lines: { stream: string; line: string }[],
) {
  if (lines.length === 0) return;
  await db.insert(deployment_logs).values(
    lines.map((item) => {
      return { deployment_id, stream: item.stream, line: item.line };
    }),
  );
}

export function CreateLogBuffer(deployment_id: string) {
  let pending: LogLine[] = [];
  let chain: Promise<void> = Promise.resolve();
  let totalLines = 0;
  let closed = false;

  function Flush() {
    if (pending.length === 0) return chain;
    const batch = pending;
    pending = [];
    emitter.to(`deployment:${deployment_id}`).emit("deploy_logs", batch);
    chain = chain.then(() => {
      return InsertLogs(deployment_id, batch).catch(function (e) {
        console.error("Failed to insert logs", deployment_id, e);
      });
    });
    return chain;
  }

  const timer = setInterval(Flush, FLUSH_INTERVAL_MS);

  function Push(stream: string, line: string) {
    if (closed || totalLines > MAX_TOTAL_LINES) return;
    totalLines++;

    const limitReached = totalLines > MAX_TOTAL_LINES;
    const safeStream = limitReached ? "system" : stream;
    const safeLine = limitReached
      ? "Log limit reached, further output is dropped"
      : line.slice(0, MAX_LINE_LENGTH);

    pending.push({
      stream: safeStream,
      line: safeLine,
      ts: new Date().toISOString(),
    });
    if (pending.length >= MAX_BATCH) void Flush();
  }

  async function Close() {
    closed = true;
    clearInterval(timer);
    await Flush();
  }

  return { Push, Close };
}
