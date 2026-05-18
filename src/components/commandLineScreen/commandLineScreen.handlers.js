const buildScreenDataFromState = (store) => {
  const transitionAnimationId = store.selectTransitionAnimationId();
  const opacity = store.selectScreenOpacity();
  const blur = store.selectScreenBlur();

  const screen = {};

  if (transitionAnimationId) {
    screen.animations = {
      resourceId: transitionAnimationId,
    };
  }

  if (opacity !== undefined) {
    screen.opacity = opacity;
  }

  if (blur) {
    screen.blur = blur;
  }

  return screen;
};

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: {
          screen: buildScreenDataFromState(store),
        },
      },
    }),
  );
};

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
      opacity: props?.screen?.opacity,
      blur: Boolean(props?.screen?.blur),
      blurX: props?.screen?.blur?.x,
      blurY: props?.screen?.blur?.y,
      blurQuality: props?.screen?.blur?.quality,
      blurKernelSize: props?.screen?.blur?.kernelSize,
      blurRepeatEdgePixels: props?.screen?.blur?.repeatEdgePixels,
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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const screen = buildScreenDataFromState(store);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        screen,
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
