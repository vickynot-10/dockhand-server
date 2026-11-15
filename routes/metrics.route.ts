import { Router } from "express";

import { AuthMiddleware } from "../middleware/auth.middleware.js";

import { GetMetrics } from "../controllers/metrics.controller.js";
const router = Router();

router.use(AuthMiddleware);

router.get("/", GetMetrics);
export default router;
