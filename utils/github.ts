import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { users } from "../schema/database/user.js";
import { decrypt } from "../libs/crypto.js";
import { simpleGit } from "simple-git";
import Docker from "dockerode";
import type { GitHubOptions } from "../types/deploy.types.js";
const docker = new Docker();
export async function getGithubToken(userId: string) {
  const [user] = await db
    .select({ github_token: users.github_token })
    .from(users)
    .where(eq(users.id, userId));

  if (!user?.github_token) return null;
  return decrypt(user.github_token);
}

function HideToken(message: string, token: string | null): string {
  if (!token) return message;
  return message.replaceAll(token, "***");
}

export async function BuildWithGithub(options: GitHubOptions) {
  const token = await getGithubToken(options.user_id);
  const auth = token ? `x-access-token:${token}@` : "";

  const { repo_name, branch, root, slug } = options;

  const repoUrl = `https://${auth}github.com/${repo_name}.git`;

  try {
    const lsRemote = await simpleGit().listRemote([
      repoUrl,
      `refs/heads/${branch}`,
    ]);
    const commit_sha = lsRemote.split("\t")[0]?.trim();
    if (!commit_sha) {
      throw new Error("Branch not found");
    }

    const remote = `${repoUrl}#${branch}${root ? `:${root}` : ""}`;

    const imageTag = `${slug}:${commit_sha.slice(0, 12)}`;

    const buildImg = await docker.buildImage(
      null as unknown as NodeJS.ReadableStream,
      {
        remote,
        t: imageTag,
      },
    );

    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(buildImg, (err: Error | null, result) => {
        if (err) {
          return reject(err);
        }
        const isFailed = result.find((val) => val.error);
        if (isFailed) return reject(new Error(isFailed.error));
        resolve();
      });
    });
    return { imageTag, commit_sha };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(HideToken(message, token));
  }
}
