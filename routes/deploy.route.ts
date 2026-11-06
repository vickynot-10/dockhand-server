import { Router } from "express";
``;
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import { GetDeployMentlogs } from "../controllers/deploy.controller.js";
const router = Router();

router.use(AuthMiddleware);

router.get("/", GetDeployMentlogs);

export default router;
