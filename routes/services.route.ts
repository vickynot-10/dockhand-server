import { Router } from "express";
import { SaveServices } from "../controllers/services.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);

router.post("/", SaveServices);

export default router;
