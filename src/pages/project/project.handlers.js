export const handleBeforeMount = (deps) => {
  const { repository, store } = deps;

  const state = repository.getState();

  console.log("state", state);

  const project = state.project;

  store.setProjectName(project.name);
  store.setProjectDescription(project.description);
  store.setProjectImageUrl(project.imageUrl);
};

export const handleClickOverlay = (payload, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
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
