import { createProjectService } from "./projectService.js";

export const createAndroidProjectServiceWithCollab = async ({
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
