export interface DeployParams {
  user_id: string;
  project_id: string;
  service_id: string;
  deploy_type: number;
  trigger_type: number;
}

export type RunContainerOptions = {
  name: string;
  image: string;
  slug: string;
  port: number;
  hostname: string;
  env_vars?: { key: string; value: string }[];
};

export type GitHubOptions = {
  user_id: string;
  repo_name: string;
  branch: string;
  root: string;
  type: string;
  slug: string;
  build_command: string;
  runtime: number;
  start_command: string | null;
  output_directory: string;
  port: number;
  env_vars?: { key: string; value: string }[];
};

export type OnLog = (stream: string, line: string) => void;
