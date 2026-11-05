export const COOKIE = "dockhand";

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
  SUPERSEDED: 6,
};
