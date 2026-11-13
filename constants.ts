export const COOKIE = "dockhand";

export const MEMORY_LIMIT_MB = 256;

export const DEPLOY_TYPE = {
  GITHUB: 1,
  DOCKER: 2,
} as const;

export const DEPLOYMENT_STATUS = {
  QUEUED: 1,
  BUILDING: 2,
  RUNNING: 3,
  FAILED: 4,
  CANCELLED: 5,
  SUSPENDED: 6,
  SUPERSEDED: 7,
  STOPPED: 8,
} as const;

export const DEPLOY_TRIGGER = {
  AUTO: 1,
  MANUAL: 2,
  ROLLBACK: 3,
} as const;

export const GITHUB_REPO_TYPE = {
  PUBLIC: 1,
  PRIVATE: 2,
} as const;

export const RUNTIMES = {
  NODE: 1,
  PYTHON: 2,
  JAVA: 3,
  RUBY: 4,
  ELIXIR: 5,
  RUST: 6,
} as const;
