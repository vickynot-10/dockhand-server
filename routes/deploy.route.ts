import { Router } from "express";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import {
  GetDeployMentlogs,
  GetDeployMentlogsTable,
  RollbackToDeployment,
} from "../controllers/deploy.controller.js";
const router = Router();

router.use(AuthMiddleware);

router.get("/", GetDeployMentlogs);
router.get("/table", GetDeployMentlogsTable);
router.post("/rollback", RollbackToDeployment);

export default router;
