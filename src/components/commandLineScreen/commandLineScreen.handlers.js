import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const buildScreenDataFromState = (store) => {
  const transitionAnimationId = store.selectTransitionAnimationId();
  const playbackSpeed = store.selectAnimationPlaybackSpeed();
  const playbackContinuity = store.selectAnimationPlaybackContinuity();
  const opacity = store.selectScreenOpacity();
  const blur = store.selectScreenBlurActionValue();

  const screen = {};

  if (transitionAnimationId) {
    screen.animations = {
      resourceId: transitionAnimationId,
      playback: {
        continuity: playbackContinuity,
        speed: playbackSpeed,
      },
    };
  }

  if (opacity !== undefined) {
    screen.opacity = opacity;
  }

  if (blur !== undefined) {
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
  const screen = props?.screen ?? {};
  const formValues = {
    transitionAnimationId: screen?.animations?.resourceId,
    playbackSpeed: screen?.animations?.playback?.speed,
    playbackContinuity: screen?.animations?.playback?.continuity,
    opacity: screen?.opacity,
  };

  if (Object.hasOwn(screen, "blur")) {
    formValues.blur = Boolean(screen.blur);
    formValues.blurX = screen.blur?.x;
    formValues.blurY = screen.blur?.y;
    formValues.blurQuality = screen.blur?.quality;
    formValues.blurKernelSize = screen.blur?.kernelSize;
    formValues.blurRepeatEdgePixels = screen.blur?.repeatEdgePixels;
  }

  store.setScreenOptionVisibility({
    opacityEnabled: screen.opacity !== undefined,
    blurEnabled: Boolean(screen.blur),
    blurExplicit: Object.hasOwn(screen, "blur"),
  });
  store.setAnimations({
    animations,
  });
  store.setFormValues({
    values: formValues,
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

export const handleOptionsSectionAction = async (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { actionId, position, sectionId } = payload._event.detail;

  if (sectionId === "opacity" && actionId === "remove") {
    store.removeOpacityOption();
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (sectionId === "blur" && actionId === "remove") {
    store.removeBlurOption();
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  if (sectionId !== "options" || actionId !== "add") {
    return;
  }

  const copy = selectCommandLineCopy(i18n);
  const items = [];
  if (!store.selectOpacityOptionEnabled()) {
    items.push({
      type: "item",
      label: localizeCommandLineText("Opacity", copy),
      key: "opacity",
    });
  }
  if (!store.selectBlurOptionEnabled()) {
    items.push({
      type: "item",
      label: localizeCommandLineText("Blur", copy),
      key: "blur",
    });
  }
  if (items.length === 0) {
    return;
  }

  const result = await appService.showDropdownMenu({
    items,
    x: position.x,
    y: position.y,
    place: "be",
  });

  if (result?.item?.key === "opacity") {
    store.showOpacityOption();
  } else if (result?.item?.key === "blur") {
    store.showBlurOption();
  } else {
    return;
  }

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
