import type { Request, Response } from "express";
import { send_error, send_success } from "../utils/response.js";
import axios from "axios";
import { getGithubToken } from "../utils/github.js";

const LOCKFILES = [
  { file: "pnpm-lock.yaml", install: "pnpm install", build: "pnpm run build" },
  { file: "yarn.lock", install: "yarn install", build: "yarn build" },
  { file: "bun.lockb", install: "bun install", build: "bun run build" },
  { file: "bun.lock", install: "bun install", build: "bun run build" },
  { file: "package-lock.json", install: "npm install", build: "npm run build" },
];

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

function handleGithubError(res: Response, e: any, fallback: string) {
  if (e.response?.status === 401) {
    return send_error(
      res,
      401,
      "GitHub token invalid. Please reconnect GitHub.",
    );
  }
  if (e.response?.status === 404) {
    return send_error(res, 404, "Repository or branch not found");
  }
  console.error(e);
  return send_error(res, 500, fallback);
}

function joinPath(base: string, path: string) {
  return [base, path]
    .filter(Boolean)
    .join("/")
    .replace(/^\/+|\/+$/g, "");
}

function isIgnored(path: string) {
  return path
    .split("/")
    .some(
      (p) => p.startsWith(".") || ["node_modules", "dist", "build"].includes(p),
    );
}

async function fetchTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
) {
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const { data } = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodedBranch}`,
    {
      headers: githubHeaders(token),
      params: { recursive: 1 },
    },
  );
  return data;
}

export async function GetRepos(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return send_error(res, 401, "Invalid Credentials");
    }

    const github_token = await getGithubToken(userId);
    if (!github_token) {
      return send_error(res, 400, "GitHub not connected");
    }

    const { data } = await axios.get("https://api.github.com/user/repos", {
      headers: githubHeaders(github_token),
      params: {
        sort: "updated",
        per_page: 100,
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
    return handleGithubError(res, e, "Failed to fetch repositories");
  }
}

export async function GetBranches(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return send_error(res, 401, "Invalid Credentials");
    }

    const { owner, repo } = req.query;

    const github_token = await getGithubToken(userId);
    if (!github_token) {
      return send_error(res, 400, "GitHub not connected");
    }

    const { data } = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: githubHeaders(github_token) },
    );

    const { data: branchData } = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: githubHeaders(github_token),
        params: { per_page: 100 },
      },
    );

    return send_success(
      res,
      200,
      {
        default_branch: data.default_branch,
        branches: branchData.map((b: any) => b.name),
      },
      "Branches fetched",
    );
  } catch (e: any) {
    return handleGithubError(res, e, "Failed to fetch branches");
  }
}

export async function GetTree(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return send_error(res, 401, "Invalid Credentials");
    }

    const { owner, repo, branch } = req.query as {
      owner: string;
      repo: string;
      branch: string;
    };

    if (!owner || !repo || !branch) {
      return send_error(res, 400, "owner, repo and branch are required");
    }

    const token = await getGithubToken(userId);
    if (!token) {
      return send_error(res, 400, "GitHub not connected");
    }

    const data = await fetchTree(token, owner, repo, branch);

    const dirs: string[] = data.tree
      .filter((i: any) => i.type === "tree" && !isIgnored(i.path))
      .map((i: any) => i.path);

    const package_dirs: string[] = data.tree
      .filter(
        (i: any) =>
          i.type === "blob" &&
          !isIgnored(i.path) &&
          (i.path === "package.json" || i.path.endsWith("/package.json")),
      )
      .map((i: any) =>
        i.path === "package.json"
          ? "/"
          : i.path.slice(0, -"/package.json".length),
      );

    return send_success(
      res,
      200,
      { dirs, package_dirs, truncated: data.truncated },
      "Tree fetched",
    );
  } catch (e: any) {
    return handleGithubError(res, e, "Failed to fetch folder structure");
  }
}

function getBuildCommand(paths: Set<string>, dir: string) {
  const lock =
    LOCKFILES.find((l) => paths.has(joinPath(dir, l.file))) ??
    LOCKFILES.find((l) => paths.has(l.file));

  const install = lock?.install ?? "npm install";
  const build = lock?.build ?? "npm run build";
  return `${install} && ${build}`;
}

export async function GetDetect(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return send_error(res, 401, "Invalid Credentials");
    }

    const { owner, repo, branch, root_directory } = req.query as {
      owner: string;
      repo: string;
      branch: string;
      root_directory?: string;
    };

    if (!owner || !repo || !branch) {
      return send_error(res, 400, "owner, repo and branch are required");
    }

    const token = await getGithubToken(userId);
    if (!token) {
      return send_error(res, 400, "GitHub not connected");
    }

    const data = await fetchTree(token, owner, repo, branch);
    const paths = new Set<string>(
      data.tree.filter((i: any) => i.type === "blob").map((i: any) => i.path),
    );

    const dir = joinPath("", root_directory ?? "");

    if (!paths.has(joinPath(dir, "package.json"))) {
      return send_success(res, 200, null, "No package.json found");
    }

    return send_success(
      res,
      200,
      { build_command: getBuildCommand(paths, dir) },
      "Build command detected",
    );
  } catch (e: any) {
    return handleGithubError(res, e, "Failed to detect build command");
  }
}
