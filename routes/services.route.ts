import { Router } from "express";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import { GetRepos } from "../controllers/services.controller.js";

const router = Router();

router.use(AuthMiddleware);
router.get("/repos", GetRepos);

export default router;
