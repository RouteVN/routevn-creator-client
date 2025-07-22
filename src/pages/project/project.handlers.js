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

export const handleProjectImageClick = (e, deps) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";

  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      await handleProjectImageUpload(file, deps);
    }
    document.body.removeChild(input);
  };

  document.body.appendChild(input);
  input.click();
};

export const handleProjectImageUpload = async (file, deps) => {
  const { store, render, repository, uploadImageFiles, subject } = deps;

  try {
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
