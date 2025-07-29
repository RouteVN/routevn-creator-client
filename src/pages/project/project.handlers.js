export const handleBeforeMount = (deps) => {
  const { repository, store } = deps;
  const { project } = repository.getState();
  store.setProject(project);
};

export const handleAfterMount = async (deps) => {
  const { repository, httpClient, render, store } = deps;
  const { project } = repository.getState();

  if (!project.iconFileId) {
    return;
  }
  const { url } = await httpClient.creator.getFileContent({
    fileId: project.iconFileId,
    projectId: "someprojectId",
  });

  store.setFieldResources({
    iconSrc: url,
  });

  render();
};

export const handleFormChange = (e, deps) => {
  const { repository } = deps;
  repository.addAction({
    actionType: "set",
    target: `project.${e.detail.name}`,
    value: e.detail.fieldValue,
  });
};

export const handleFormExtraEvent = async (e, deps) => {
  const { filePicker, uploadImageFiles, repository, subject, render, store } =
    deps;
  if (e.detail.name !== "iconFileId") {
    return;
  }

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

    if (successfulUploads.length > 0) {
      const result = successfulUploads[0];
      repository.addAction({
        actionType: "set",
        target: "project.iconFileId",
        value: result.fileId,
      });

      store.setFieldResources({
        iconSrc: result.downloadUrl,
      });

      subject.dispatch("project-image-update");
      render();
    }
  } catch (error) {
    console.error("Project image upload failed:", error);
  }
};
