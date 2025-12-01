import { validateIconDimensions } from "../../utils/fileProcessors";

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;
  await projectService.ensureRepository();
  const state = projectService.getState();
  const { project } = state;
  store.setProject(project);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService } = deps;
  await projectService.appendEvent({
    type: "set",
    payload: {
      target: `project.${payload._event.detail.name}`,
      value: payload._event.detail.fieldValue,
    },
  });
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, subject, render, store } = deps;

  try {
    const files = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
    });

    if (!files || files.length === 0) {
      return; // User cancelled
    }

    const file = files[0];

    const { isValid, message } = await validateIconDimensions(file);
    if (!isValid) {
      appService.showToast(message, { title: "Error" });
      return;
    }

    const successfulUploads = await projectService.uploadFiles([file]);

    if (successfulUploads.length > 0) {
      const result = successfulUploads[0];
      await projectService.appendEvent({
        type: "set",
        payload: {
          target: "project.iconFileId",
          value: result.fileId,
        },
      });

      store.setIconFileId(result.fileId);
      subject.dispatch("project-image-update");
      render();
    }
  } catch (error) {
    console.error("Project image upload failed:", error);
  }
};

export const handleBackToProjects = async (deps) => {
  const { appService } = deps;
  appService.navigate("/projects");
};
