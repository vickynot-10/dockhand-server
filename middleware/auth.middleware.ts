import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { COOKIE } from "../constants.js";
import { send_error } from "../utils/response.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export function AuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[COOKIE];

  if (!token) {
    return send_error(res, 401, "Not Logged In , Try Login Again !");
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET_KEY as string,
    ) as AuthUser;

    if (!decoded?.id) {
      return send_error(res, 401, "Not Logged In , Try Login Again !");
    }

    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
    };

    next();
  } catch (err) {
    return send_error(res, 401, "Not Logged In , Try Login Again !");
  }
}
