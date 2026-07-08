import { createProjectService } from "./projectService.js";

export const createIOSProjectServiceWithCollab = async ({
  router,
  filePicker,
  db,
  creatorVersion,
}) => {
  return createProjectService({
    router,
    filePicker,
    db,
    creatorVersion,
  });
};
