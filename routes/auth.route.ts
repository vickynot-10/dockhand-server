import { Router } from "express";
import { SignUp, SignIn, SignOut } from "../controllers/auth.controller.js";

const router = Router();

router.post("/sign-up", SignUp);
router.post("/sign-in", SignIn);
router.post("/sign-out", SignUp);

export default router;
