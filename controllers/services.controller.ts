import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import { db } from "../config/db.js";
import { eq } from "drizzle-orm";

import { decrypt } from "../libs/crypto.js";
import { users } from "../schema/database/user.js";
import axios from "axios";

export async function GetRepos(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return send_error(res, 401, "Invalid Credentials");
    }

    const [user] = await db
      .select({ github_token: users.github_token })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.github_token) {
      return send_error(res, 400, "GitHub not connected");
    }

    const { data } = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${decrypt(user.github_token)}`,
        Accept: "application/vnd.github+json",
      },
      params: {
        sort: "updated",
        affiliation: "owner,collaborator,organization_member",
      },
    });

    const repos = data.map((r: any) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      url: r.html_url,
      updated_at: r.updated_at,
    }));

    return send_success(res, 200, repos, "Repos fetched");
  } catch (e: any) {
    if (e.response?.status === 401) {
      return send_error(
        res,
        401,
        "GitHub token invalid. Please reconnect GitHub.",
      );
    }
    console.error(e);
    return send_error(res, 500, "Failed to fetch repositories");
  }
}
