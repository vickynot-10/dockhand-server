import bcrypt from "bcrypt";

import { send_success, send_error } from "../utils/response.js";
import { db } from "../config/db.js";
import { generateToken } from "../libs/jwt.js";
import type { Request, Response } from "express";
import { LoginAuthSchema, SignUpSchema } from "../schema/zod/auth.js";
import { users } from "../schema/database/user.js";
import { eq } from "drizzle-orm";
import axios from "axios";
import { COOKIE } from "../constants.js";
import { encrypt } from "../libs/crypto.js";
import crypto from "node:crypto";

function SetCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
export async function SignUp(req: Request, res: Response) {
  const result = SignUpSchema.safeParse(req.body);

  if (!result.success) {
    return send_error(res, 400, result.error.issues[0]?.message);
  }

  const { email, password, name } = result.data;

  const isExists = await db.select().from(users).where(eq(users.email, email));

  if (isExists.length > 0) {
    return send_error(res, 404, "User with Mail Already Exists");
  }

  const hashed_password = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({
      email: email,
      name: name,
      password: hashed_password,
    })
    .returning();

  if (!user) {
    return send_error(res, 500, "Internal Server Error");
  }

  const token = generateToken({
    id: user.id,
    name: user.name,
    email: user.email,
  });
  SetCookie(res, token);

  return send_success(res, 201, null, "Signed Up Successfully !");
}

export async function SignIn(req: Request, res: Response) {
  const result = LoginAuthSchema.safeParse(req.body);

  if (!result.success) {
    return send_error(res, 400, result.error.issues[0]?.message);
  }

  const { email, password } = result.data;

  const [user] = await db
    .select({
      email: users.email,
      password: users.password,
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!user || !user.password) {
    return send_error(res, 400, "Invalid Credentials !");
  }

  const is_match = await bcrypt.compare(password, user.password);

  if (!is_match) {
    return send_error(res, 400, "Invalid Credentials !");
  }

  const token = generateToken({
    id: user.id,
    name: user.name,
    email: user.email,
  });
  SetCookie(res, token);

  return send_success(res, 201, null, "Signed Up Successfully !");
}

export async function SignOut(req: Request, res: Response) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return send_success(res, 200, null, "Logged Out Successfully !");
}

const STATE_COOKIE = "gh_oauth_state";

export function GithubAuth(req: Request, res: Response) {
  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  if (!CLIENT_ID) return send_error(res, 500, "GitHub OAuth not configured");

  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: "read:user user:email repo",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

export async function GithubCallback(req: Request, res: Response) {
  const UI_URL = process.env.CLIENT_URL!;
  const fail = (msg: string) =>
    res.redirect(`${UI_URL}/login?error=${encodeURIComponent(msg)}`);

  try {
    const { code, state } = req.query;

    if (
      typeof code !== "string" ||
      !state ||
      state !== req.cookies?.[STATE_COOKIE]
    ) {
      return fail("Invalid OAuth state");
    }
    res.clearCookie(STATE_COOKIE);

    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } },
    );

    const access_token = tokenRes.data.access_token as string | undefined;
    if (!access_token) return fail("GitHub authentication failed");

    const headers = {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/vnd.github+json",
    };

    const { data: ghUser } = await axios.get("https://api.github.com/user", {
      headers,
    });
    const { data: emails } = await axios.get(
      "https://api.github.com/user/emails",
      { headers },
    );

    const email: string | undefined = emails.find(
      (e: { email: string; primary: boolean; verified: boolean }) =>
        e.primary && e.verified,
    )?.email;

    if (!email) return fail("No verified email on your GitHub account");

    const githubId = String(ghUser.id);
    const githubToken = encrypt(access_token);

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.github_id, githubId));

    if (user) {
      await db
        .update(users)
        .set({ github_token: githubToken })
        .where(eq(users.id, user.id));
    } else {
      [user] = await db.select().from(users).where(eq(users.email, email));

      if (user) {
        await db
          .update(users)
          .set({ github_id: githubId, github_token: githubToken })
          .where(eq(users.id, user.id));
      } else {
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const hashed_password = await bcrypt.hash(randomPassword, 10);

        [user] = await db
          .insert(users)
          .values({
            email,
            name: ghUser.name ?? ghUser.login,
            password: hashed_password,
            github_id: githubId,
            github_token: githubToken,
          })
          .returning();
      }
    }

    if (!user) return fail("Could not create user");

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
    });
    SetCookie(res, token);

    res.redirect(`${UI_URL}/`);
  } catch (e) {
    console.error("GitHub callback error:", e);
    fail("Something went wrong");
  }
}
