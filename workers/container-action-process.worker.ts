import type { Job } from "bullmq";
import { DEPLOYMENT_STATUS } from "../constants.js";
import {
  RemoveContainer,
  StartContainers,
  StopContainers,
} from "../utils/docker.js";
import { UpdateDeployment } from "../service/deploy.service.js";
import type { ContainerActionType } from "../queue/container-actions.queue.js";

type ActionJob = {
  deployment_id: string;
  service_id: string;
  container_name: string;
  type: ContainerActionType;
};

export async function ProcessContainerActions(job: Job<ActionJob>) {
  const { deployment_id, container_name, type } = job.data;

  if (type === "delete") {
    await RemoveContainer(container_name);
    return;
  }

  if (type === "suspend") {
    await StopContainers(container_name);
    await UpdateDeployment(deployment_id, {
      status: DEPLOYMENT_STATUS.SUSPENDED,
    });
    return;
  }

  await StartContainers(container_name);
  await UpdateDeployment(deployment_id, {
    status: DEPLOYMENT_STATUS.RUNNING,
  });
}
