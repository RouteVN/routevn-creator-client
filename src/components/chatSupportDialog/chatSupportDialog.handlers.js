export const handleDialogClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("close"));
};

export const handleChannelClick = (deps, payload) => {
  const { appService, dispatchEvent, store } = deps;
  const { channelId } = payload._event.currentTarget.dataset;

  dispatchEvent(new CustomEvent("close"));
  appService.openUrl(store.selectChannelHref({ channelId }));
};

export const handleChannelKeyDown = (deps, payload) => {
  const { key } = payload._event;
  if (key !== "Enter" && key !== " ") {
    return;
  }

  payload._event.preventDefault();
  handleChannelClick(deps, payload);
};
