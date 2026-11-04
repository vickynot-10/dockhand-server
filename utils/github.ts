import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { users } from "../schema/database/user.js";
import { decrypt } from "../libs/crypto.js";

export async function getGithubToken(userId: string) {
  const [user] = await db
    .select({ github_token: users.github_token })
    .from(users)
    .where(eq(users.id, userId));

  if (!user?.github_token) return null;
  return decrypt(user.github_token);
}
