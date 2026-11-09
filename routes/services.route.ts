import { Router } from "express";
import {
  DeployServices,
  EditServices,
  GetServiceByID,
  GetServiceByIDForEdit,
  GetServicesList,
  SaveServices,
  ServicesActions,
} from "../controllers/services.controller.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
const router = Router();

router.use(AuthMiddleware);
router.post("/", SaveServices);
router.put("/", EditServices);
router.post("/deploy", DeployServices);
router.get("/", GetServiceByID);
router.get("/list", GetServicesList);
router.get("/get-service", GetServiceByIDForEdit);
router.post("/actions", ServicesActions);

export default router;
