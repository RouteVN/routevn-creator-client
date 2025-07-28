export const handleBeforeMount = (deps) => {
  const { repository, store } = deps;
  const { project } = repository.getState();
  store.setProject(project);
};

export const handleAfterMount = async (deps) => {
  const { repository, httpClient, render, store } = deps;
  const { project } = repository.getState();

  console.log("project", project);

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

export const handleClickOverlay = (payload, deps) => {
  const { store, render } = deps;
  store.hidePopover();
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

export const handleFormValueClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("form-value-", "");

  store.showPopover({
    position: {
      x: e.clientX,
      y: e.clientY,
    },
    formConfig: id,
  });
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, repository } = deps;
  store.hidePopover();

  const { formValues } = e.detail;

  const { name, description } = formValues;

  if (name) {
    store.setProjectName(name);
    repository.addAction({
      actionType: "set",
      target: "project.name",
      value: name,
    });
  }

  if (description) {
    repository.addAction({
      actionType: "set",
      target: "project.description",
      value: description,
    });
    store.setProjectDescription(description);
  }

  render();
};

export const handleProjectImageClick = async (e, deps) => {
  const { store, render, repository, uploadImageFiles, subject, filePicker } =
    deps;

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
      const imageUrl = result.downloadUrl;

      store.setProjectImageUrl(imageUrl);
      repository.addAction({
        actionType: "set",
        target: "project.imageUrl",
        value: imageUrl,
      });

      subject.dispatch("project-image-update");
      render();
    }
  } catch (error) {
    console.error("Project image upload failed:", error);
  }
};
