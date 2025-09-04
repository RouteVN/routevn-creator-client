export const handleBeforeMount = (deps) => {
  // handleBeforeMount must be synchronous
  // Async logic will be handled in handleAfterMount
};

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, store, render, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { project } = repository.getState();
  store.setProject(project);
  render();
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  await repository.addAction({
    actionType: "set",
    target: `project.${e.detail.name}`,
    value: e.detail.fieldValue,
  });
};

export const handleFormExtraEvent = async (_, deps) => {
  const {
    filePicker,
    uploadImageFiles,
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
    const successfulUploads = await uploadImageFiles([file], "someprojectId");

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
