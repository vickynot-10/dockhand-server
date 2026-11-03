import { Router } from "express";
import {
  SignUp,
  SignIn,
  SignOut,
  GithubAuth,
  GithubCallback,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/sign-up", SignUp);
router.post("/sign-in", SignIn);
router.post("/sign-out", SignUp);

router.get("/github", GithubAuth);
router.get("/github/callback", GithubCallback);
export default router;
