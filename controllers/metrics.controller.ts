import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../config/db.js";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { deployments } from "../schema/database/deployments.js";
import { services } from "../schema/database/services.js";
import { MetricsQuerySchema } from "../schema/zod/metrics.schema.js";
import { getContainerSnapshot } from "../utils/containerStats.js";
import { send_error, send_success } from "../utils/response.js";

export async function GetMetrics(req: Request, res: Response) {
  const userId = req.user!.id;

  if (!userId) {
    return send_error(res, 401, "Invalid Session !");
  }

  const parsed = MetricsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return send_error(
      res,
      400,
      parsed.error.issues[0]?.message ?? "Invalid Query !",
    );
  }

  const { service_id } = parsed.data;
  const serviceFilter = service_id
    ? sql`AND service_id = ${service_id}`
    : sql``;

  const [deploymentStats, running, deploymentsOverDays] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_deployments,

        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.FAILED})::int AS failed,
        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.QUEUED})::int AS queued,
        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.RUNNING})::int AS running,
        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.CANCELLED})::int AS cancelled,
        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.STOPPED})::int AS stopped,
        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.SUPERSEDED})::int AS superseded,
        COUNT(*) FILTER (WHERE status = ${DEPLOYMENT_STATUS.SUSPENDED})::int AS suspended,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (finished_on - started_on))) FILTER (
            WHERE started_on IS NOT NULL AND finished_on IS NOT NULL
          ),
          2
        ) AS avg_duration_seconds
      FROM deployments
      WHERE user_id = ${userId}
      ${serviceFilter}
    `),
    db
      .select({
        service_id: services.id,
        service_name: services.name,
        container_name: deployments.container_name,
      })
      .from(deployments)
      .innerJoin(services, eq(services.id, deployments.service_id))
      .where(
        and(
          eq(services.user_id, userId),
          isNotNull(deployments.container_name),
          eq(deployments.status, DEPLOYMENT_STATUS.RUNNING),
          service_id ? eq(services.id, service_id) : undefined,
        ),
      )
      .orderBy(desc(deployments.created_on)),

    db
      .select({
        deployment_date: deployments.created_on,
        count: count(),
      })
      .from(deployments)
      .where(
        and(
          eq(deployments.user_id, userId),
          service_id ? eq(deployments.service_id, service_id) : undefined,
        ),
      )
      .groupBy(deployments.created_on)
      .orderBy(deployments.created_on),
  ]);

  const latestPerService = new Map<string, (typeof running)[number]>();
  for (const item of running) {
    if (!latestPerService.has(item.service_id)) {
      latestPerService.set(item.service_id, item);
    }
  }

  const snapshots = await Promise.all(
    [...latestPerService.values()].map(async (item) => {
      const snapshot = await getContainerSnapshot(item.container_name!);
      if (!snapshot) return null;
      return {
        service_id: item.service_id,
        service_name: item.service_name,
        ...snapshot,
      };
    }),
  );

  return send_success(res, 200, {
    deployments: deploymentStats.rows[0],
    containers: snapshots.filter((item) => item !== null),
    deploymentsOverDays,
  });
}
