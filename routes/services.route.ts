import { Router } from "express";
import {
  SaveServices,
  ServicesActions,
} from "../controllers/services.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);

router.post("/actions", ServicesActions);
router.post("/", SaveServices);

export default router;
