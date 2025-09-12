export const handleAfterMount = async (deps) => {
  const { repositoryFactory, store, render, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { project } = repository.getState();
  store.setProject(project);
  render();
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, keyValueStore } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  await repository.addAction({
    actionType: "set",
    target: `project.${e.detail.name}`,
    value: e.detail.fieldValue,
  });

  // Sync project name/description changes to the projects list
  if (e.detail.name === "name" || e.detail.name === "description") {
    try {
      const projects = (await keyValueStore.get("projects")) || [];
      const projectIndex = projects.findIndex((proj) => proj.id === p);

      if (projectIndex !== -1) {
        projects[projectIndex][e.detail.name] = e.detail.fieldValue;
        await keyValueStore.set("projects", projects);
      }
    } catch (error) {
      console.warn("Could not sync project info to projects list:", error);
    }
  }
};

export const handleFormExtraEvent = async (_, deps) => {
  const {
    filePicker,
    fileManagerFactory,
    repositoryFactory,
    router,
    subject,
    render,
    store,
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
    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(p);
    const successfulUploads = await fileManager.upload([file]);

    // TODO better handle failed uploads
    if (successfulUploads.length > 0) {
      const result = successfulUploads[0];
      await repository.addAction({
        actionType: "set",
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
