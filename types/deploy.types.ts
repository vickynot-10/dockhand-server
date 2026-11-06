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
};
