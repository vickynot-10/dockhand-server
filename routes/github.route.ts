import { Router } from "express";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import {
  GetBranches,
  GetDetect,
  GetRepos,
  GetTree,
} from "../controllers/github.controller.js";

const router = Router();

router.use(AuthMiddleware);
router.get("/repos", GetRepos);
router.get("/branch", GetBranches);
router.get("/tree", GetTree);
router.get("/detect", GetDetect);

export default router;
