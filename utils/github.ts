import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { users } from "../schema/database/user.js";
import { decrypt } from "../libs/crypto.js";
import { simpleGit } from "simple-git";
import Docker from "dockerode";
import type { GitHubOptions, OnLog } from "../types/deploy.types.js";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { lstat, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { RUNTIMES } from "../constants.js";
const docker = new Docker();

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REPO_DOCKERFILE = "Dockerfile";
const GENERATED_DOCKERFILE = "Dockerfile.dockhand";

type EnvVar = { key: string; value: string };

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

export async function BuildWithGithub(options: GitHubOptions, onLog?: OnLog) {
  const token = await getGithubToken(options.user_id);
  const auth = token ? `x-access-token:${token}@` : "";

  const { repo_name, branch, slug } = options;

  const repoUrl = `https://${auth}github.com/${repo_name}.git`;

  try {
    let commit_sha = options.commit_sha;

    if (!commit_sha) {
      const lsRemote = await simpleGit().listRemote([
        repoUrl,
        `refs/heads/${branch}`,
      ]);
      commit_sha = lsRemote.split("\t")[0]?.trim();
    }

    if (!commit_sha) {
      throw new Error("Branch not found");
    }
    onLog?.("system", `Building ${repo_name}@${commit_sha.slice(0, 7)}`);

    const imageTag = `${slug}:${commit_sha.slice(0, 12)}`;
    const build_options: GitHubOptions = { ...options, commit_sha };

    await BuildFromRepo(repoUrl, build_options, imageTag, token, onLog);
    return { imageTag, commit_sha };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(HideToken(message, token));
  }
}

function ContinuteBuildStream(
  stream: NodeJS.ReadableStream,
  token: string | null,
  onLog?: OnLog,
) {
  function HandleEvent(event: { stream?: string; error?: string }) {
    if (!event.stream) return;
    for (const line of event.stream.split("\n")) {
      if (line.trim()) onLog?.("stdout", HideToken(line, token));
    }
  }

  return new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err: Error | null, result) => {
        if (err) return reject(err);
        const isFailed = result.find((val) => val.error);
        if (isFailed) return reject(new Error(isFailed.error));
        resolve();
      },
      HandleEvent,
    );
  });
}

function GetEnvVars(vars: EnvVar[]) {
  const env_vars = (vars ?? []).filter((item) => {
    return ENV_KEY_REGEX.test(item.key);
  });
  const buildargs: Record<string, string> = {};
  for (const item of env_vars) {
    buildargs[item.key] = item.value;
  }
  return { env_vars, buildargs };
}

const RUNTIME_IMAGES: Record<number, string> = {
  [RUNTIMES.NODE]: "node:20-alpine",
  [RUNTIMES.PYTHON]: "python:3.12-slim",
  [RUNTIMES.JAVA]: "maven:3-eclipse-temurin-21",
  [RUNTIMES.RUBY]: "ruby:3.3-slim",
  [RUNTIMES.ELIXIR]: "elixir:1.17-alpine",
  [RUNTIMES.RUST]: "rust:1-slim",
};

async function HasRepoDockerfile(context_dir: string) {
  try {
    const info = await lstat(join(context_dir, REPO_DOCKERFILE));
    return info.isFile();
  } catch {
    return false;
  }
}

function StaticDockerfile(options: GitHubOptions, env_vars: EnvVar[]) {
  const { build_command, output_directory } = options;

  if (!build_command) throw new Error("Build Command is not Configured");
  if (!output_directory) throw new Error("Output Directory is not Configured");

  const safe_output = output_directory
    .replace(/^\.?\/+/, "")
    .replace(/\/+$/, "");

  if (safe_output.split("/").includes("..")) {
    throw new Error("Invalid output directory");
  }

  const listen_port = Number(options.port) || 80;
  const nginx_config = `server { listen ${listen_port}; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }`;

  return [
    "FROM node:20-alpine AS build",
    "WORKDIR /app",
    ...env_vars.map((item) => `ARG ${item.key}`),
    "COPY . .",
    `RUN ${build_command}`,
    "FROM nginx:alpine",
    `COPY --from=build /app/${safe_output} /usr/share/nginx/html`,
    `RUN echo '${nginx_config}' > /etc/nginx/conf.d/default.conf`,
    `EXPOSE ${listen_port}`,
  ].join("\n");
}

function WebServiceDockerfile(options: GitHubOptions, env_vars: EnvVar[]) {
  const { build_command, start_command } = options;

  const base_image = RUNTIME_IMAGES[Number(options.runtime)];
  if (!base_image) throw new Error("Unsupported runtime");
  if (!build_command) throw new Error("Build Command is not Configured");
  if (!start_command) throw new Error("Start Command is not Configured");

  const port = Number(options.port) || 3000;

  return [
    `FROM ${base_image}`,
    "WORKDIR /app",
    ...env_vars.map((item) => `ARG ${item.key}`),
    "COPY . .",
    `RUN ${build_command}`,
    `ENV PORT=${port}`,
    `EXPOSE ${port}`,
    `CMD ["sh", "-c", ${JSON.stringify(start_command)}]`,
  ].join("\n");
}

async function BuildFromRepo(
  repoUrl: string,
  options: GitHubOptions,
  imageTag: string,
  token: string | null,
  onLog?: OnLog,
) {
  const { env_vars, buildargs } = GetEnvVars(options.env_vars ?? []);
  const work_dir = await mkdtemp(join(tmpdir(), "dockhand-"));

  try {
    const context_dir = resolve(work_dir, "." + sep + options.root);
    if (context_dir !== work_dir && !context_dir.startsWith(work_dir + sep)) {
      throw new Error("Invalid root directory");
    }

    onLog?.("system", "Cloning repository");
    await CloneRepo(repoUrl, work_dir, options.branch, options.commit_sha);

    let dockerfile_name = REPO_DOCKERFILE;

    if (await HasRepoDockerfile(context_dir)) {
      onLog?.("system", "Dockerfile found, using it");
    } else {
      onLog?.("system", "No Dockerfile found, generating one");
      const dockerfile =
        options.type === "static"
          ? StaticDockerfile(options, env_vars)
          : WebServiceDockerfile(options, env_vars);
      dockerfile_name = GENERATED_DOCKERFILE;
      await writeFile(join(context_dir, dockerfile_name), dockerfile);
    }

    const entries = (await readdir(context_dir)).filter((name) => {
      return name !== ".git";
    });

    const buildImg = await docker.buildImage(
      { context: context_dir, src: entries },
      { t: imageTag, dockerfile: dockerfile_name, buildargs },
    );

    await ContinuteBuildStream(buildImg, token, onLog);
  } finally {
    await rm(work_dir, { recursive: true, force: true });
  }
}

async function CloneRepo(
  repoUrl: string,
  work_dir: string,
  branch: string,
  commit_sha?: string,
) {
  if (!commit_sha) {
    await simpleGit().clone(repoUrl, work_dir, [
      "--depth",
      "1",
      "--branch",
      branch,
    ]);
    return;
  }
  const git = simpleGit(work_dir);
  await git.init();
  await git.addRemote("origin", repoUrl);
  await git.fetch(["--depth", "1", "origin", commit_sha]);
  await git.checkout(["FETCH_HEAD"]);
}
