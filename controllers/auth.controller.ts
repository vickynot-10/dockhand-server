import bcrypt from "bcrypt";

import { send_success, send_error } from "../utils/response.js";
import { db } from "../config/db.js";
import { generateToken } from "../libs/jwt.js";
import type { Request, Response } from "express";
import { LoginAuthSchema, SignUpSchema } from "../schema/zod/auth.js";
import { users } from "../schema/database/user.js";
import { eq } from "drizzle-orm";
import { COOKIE } from "../constants.js";

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
