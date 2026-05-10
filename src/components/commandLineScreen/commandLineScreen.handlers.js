export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { animations } = projectService.getRepositoryState();

  store.setAnimations({
    animations,
  });
  store.setFormValues({
    values: {
      transitionAnimationId: props?.screen?.animations?.resourceId,
    },
  });
  render();
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const values = payload?._event?.detail?.values;
  if (!values) {
    return;
  }

  store.setFormValues({ values });
  render();
};

export const handleSubmitClick = (deps) => {
  const { appService, dispatchEvent, store } = deps;
  const { formValues } = store.getState();
  const transitionAnimationId = formValues?.transitionAnimationId;

  if (!transitionAnimationId) {
    appService.showAlert({
      message: "Please select a transition animation",
      title: "Warning",
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        screen: {
          animations: {
            resourceId: transitionAnimationId,
          },
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload?._event?.detail?.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
