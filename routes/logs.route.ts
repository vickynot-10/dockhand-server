import { Router } from "express";

import { AuthMiddleware } from "../middleware/auth.middleware.js";

import { GetApplicationlogs } from "../controllers/logs.controller.js";
const router = Router();

router.use(AuthMiddleware);

router.get("/", GetApplicationlogs);
export default router;
