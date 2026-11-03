import { Router } from "express";
import {
  AddOrEditProject,
  DeleteProject,
  GetProjects,
} from "../controllers/project.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);

router.post("/", AddOrEditProject);
router.get("/", GetProjects);
router.delete("/:id", DeleteProject);

export default router;
