import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export type MetricSnapshot = {
  cpu_percent: number;
  memory_bytes: number;
  memory_limit: number;
  rx_bytes: number;
  tx_bytes: number;
  started_at: string | null;
  restart_count: number;
};

function cpuPercent(stats: any) {
  const cpuDelta =
    (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (stats.cpu_stats?.system_cpu_usage ?? 0) -
    (stats.precpu_stats?.system_cpu_usage ?? 0);
  const cpus = stats.cpu_stats?.online_cpus ?? 1;
  if (systemDelta <= 0 || cpuDelta < 0) return 0;
  return (cpuDelta / systemDelta) * cpus * 100;
}

function memoryUsed(stats: any) {
  const usage = stats.memory_stats?.usage ?? 0;
  const inner = stats.memory_stats?.stats ?? {};
  const cache =
    inner.inactive_file ?? inner.total_inactive_file ?? inner.cache ?? 0;
  return Math.max(0, usage - cache);
}

function networkTotals(stats: any) {
  const interfaces = Object.values(stats.networks ?? {}) as any[];
  return interfaces.reduce(
    (sum, item) => ({
      rx: sum.rx + (item.rx_bytes ?? 0),
      tx: sum.tx + (item.tx_bytes ?? 0),
    }),
    { rx: 0, tx: 0 },
  );
}

export async function getContainerSnapshot(
  containerName: string,
): Promise<MetricSnapshot | null> {
  try {
    const container = docker.getContainer(containerName);
    const [stats, info]: [any, any] = await Promise.all([
      container.stats({ stream: false }),
      container.inspect(),
    ]);
    const net = networkTotals(stats);

    return {
      cpu_percent: cpuPercent(stats),
      memory_bytes: memoryUsed(stats),
      memory_limit: stats.memory_stats?.limit ?? 0,
      rx_bytes: net.rx,
      tx_bytes: net.tx,
      started_at: info.State?.StartedAt ?? null,
      restart_count: info.RestartCount ?? 0,
    };
  } catch {
    return null;
  }
}
