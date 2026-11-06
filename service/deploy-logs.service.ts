import { db } from "../config/db.js";
import { deployment_logs } from "../schema/database/deploy-logs.js";

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
  let pending: { stream: string; line: string }[] = [];
  let chain: Promise<void> = Promise.resolve();

  function Flush() {
    if (pending.length === 0) return chain;
    const batch = pending;
    pending = [];
    chain = chain.then(() => {
      return InsertLogs(deployment_id, batch).catch(function () {});
    });
    return chain;
  }

  const timer = setInterval(Flush, 1000);

  function Push(stream: string, line: string) {
    pending.push({ stream, line });
    if (pending.length >= 50) void Flush();
  }

  async function Close() {
    clearInterval(timer);
    await Flush();
  }

  return { Push, Close };
}
