import { sql } from "drizzle-orm";
import { DEPLOYMENT_STATUS } from "../constants.js";
import { send_error, send_success } from "../utils/response.js";
import type { Request, Response } from "express";
import { db } from "../config/db.js";

export async function GetMetrics(req: Request, res: Response) {
  const userId = req.user!.id;

  if (!userId) {
    return send_error(res, 401, "Invalid Session !");
  }

  const metrics = await db.execute(sql`
    SELECT
      COUNT(*) AS total_deployments,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.FAILED}
      ) AS failed,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.QUEUED}
      ) AS queued,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.RUNNING}
      ) AS running,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.CANCELLED}
      ) AS cancelled,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.STOPPED}
      ) AS stopped,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.SUPERSEDED}
      ) AS superseded,

      COUNT(*) FILTER (
        WHERE status = ${DEPLOYMENT_STATUS.SUSPENDED}
      ) AS suspended,

      ROUND( AVG(
      EXTRACT(EPOCH FROM (finished_on - started_on))
    ) FILTER (
      WHERE started_on IS NOT NULL
        AND finished_on IS NOT NULL
    )  ,2)
      AS avg_duration_seconds
    FROM deployments
    WHERE user_id = ${userId}
  `);

  return send_success(res, 200, metrics.rows[0]);
}
