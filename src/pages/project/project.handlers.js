import { validateIconDimensions } from "../../utils/fileProcessors";

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, store, render, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { project } = repository.getState();
  store.setProject(project);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  await repository.addEvent({
    type: "set",
    target: `project.${payload._event.detail.name}`,
    value: payload._event.detail.fieldValue,
  });
};

export const handleFormExtraEvent = async (deps) => {
  const {
    filePicker,
    fileManagerFactory,
    repositoryFactory,
    router,
    subject,
    render,
    store,
    globalUI,
  } = deps;

  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  try {
    const files = await filePicker.open({
      accept: "image/*",
      multiple: false,
    });

    if (files.length === 0) {
      return; // User cancelled
    }

    const file = files[0];

    const { isValid, message } = await validateIconDimensions(file);
    if (!isValid) {
      globalUI.showAlert({ message, title: "Error" });
      return;
    }

    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(p);
    const successfulUploads = await fileManager.upload([file]);

    // TODO better handle failed uploads
    if (successfulUploads.length > 0) {
      const result = successfulUploads[0];
      await repository.addEvent({
        type: "set",
        target: "project.iconFileId",
        value: result.fileId,
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
  const { subject } = deps;

  // Navigate back to projects page
  subject.dispatch("redirect", {
    path: "/projects",
  });
};
