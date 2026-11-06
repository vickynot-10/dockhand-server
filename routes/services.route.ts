import { Router } from "express";
import {
  GetServiceByID,
  SaveServices,
  ServicesActions,
} from "../controllers/services.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);
router.post("/", SaveServices);
router.get("/", GetServiceByID);
router.post("/actions", ServicesActions);

export default router;
