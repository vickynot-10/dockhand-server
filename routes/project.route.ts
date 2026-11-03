import { Router } from "express";
import {
  AddOrEditProject,
  DeleteProject,
  GetProjects,
  GetProjectsServices,
} from "../controllers/project.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);

router.post("/", AddOrEditProject);
router.get("/", GetProjects);
router.get("/services", GetProjectsServices);
router.delete("/:id", DeleteProject);

export default router;
