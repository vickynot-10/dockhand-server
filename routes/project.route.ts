import { Router } from "express";
import { AddOrEditProject } from "../controllers/project.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);

router.post("/", AddOrEditProject);

export default router;
