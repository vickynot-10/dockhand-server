import { Router } from "express";

import { AuthMiddleware } from "../middleware/auth.middleware.js";

import {
  DisconnectGithub,
  GetSettings,
  ResyncWebhooks,
} from "../controllers/settings.controller.js";
const router = Router();

router.use(AuthMiddleware);

router.get("/", GetSettings);
router.post("/github/disconnect", DisconnectGithub);
router.post("/webhooks/resync", ResyncWebhooks);
export default router;
