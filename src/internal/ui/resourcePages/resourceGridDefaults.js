const TABLET_VIEWPORT_MIN_WIDTH = 768;

export const resolveResourceGridDefaultItemsPerRow = ({
  props,
  browserEventsClient,
}) => {
  if (props.defaultItemsPerRow !== undefined) {
    return props.defaultItemsPerRow;
  }

  const mobileLayout =
    props.mobileLayout === true ||
    props.mobileLayout === "" ||
    props.mobileLayout === "true";
  if (!mobileLayout || props.zoomControlMode !== "columns") {
    return undefined;
  }

  const viewportWidth = browserEventsClient?.getViewportWidth() ?? 0;
  return viewportWidth >= TABLET_VIEWPORT_MIN_WIDTH ? 6 : 2;
};

export const subscribeResourceGridDefaults = (deps, syncItemsPerRow) => {
  const { browserEventsClient, render } = deps;
  return browserEventsClient?.subscribeWindowEvent({
    type: "resize",
    listener: () => {
      if (syncItemsPerRow(deps)) {
        render();
      }
    },
  });
};
