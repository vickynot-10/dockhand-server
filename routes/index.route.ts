import { Router } from "express";
import AuthRoutes from "./auth.route.js";
import ProjectRoutes from "./project.route.js";
import GithubRoutes from "./github.route.js";
import ServicesRoutes from "./services.route.js";
import DeployRoutes from "./deploy.route.js";
import LogsRoutes from "./logs.route.js";
import MetricsRoutes from "./metrics.route.js";
import SettingsRoutes from "./settings.route.js";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/projects", ProjectRoutes);
router.use("/github", GithubRoutes);
router.use("/services", ServicesRoutes);
router.use("/deployments", DeployRoutes);
router.use("/logs", LogsRoutes);
router.use("/metrics", MetricsRoutes);
router.use("/settings", SettingsRoutes);
export default router;
