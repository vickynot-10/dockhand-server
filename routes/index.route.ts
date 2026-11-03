import { Router } from "express";
import AuthRoutes from "./auth.route.js";
import ProjectRoutes from "./project.route.js";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/projects", ProjectRoutes);

export default router;
