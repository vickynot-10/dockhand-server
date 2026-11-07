import { Router } from "express";
``;
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import {
  GetDeployMentlogs,
  RollbackToDeployment,
} from "../controllers/deploy.controller.js";
const router = Router();

router.use(AuthMiddleware);

router.get("/", GetDeployMentlogs);
router.post("/rollback", RollbackToDeployment);

export default router;
