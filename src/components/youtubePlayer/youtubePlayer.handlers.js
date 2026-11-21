import { buildYouTubeWatchUrl } from "../../internal/youtube.js";

export const handleClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("close"));
};

export const handleMenuButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openMenu({ x: Math.round(rect.right), y: Math.round(rect.bottom) });
  render();
};

export const handleMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeMenu();
  render();
};

export const handleMenuItemClick = (deps, payload) => {
  const { appService, dispatchEvent, props, render, store } = deps;
  const { item } = payload._event.detail;
  store.closeMenu();
  render();

  if (item.value === "open-on-youtube") {
    dispatchEvent(new CustomEvent("close"));
    appService.openUrl(buildYouTubeWatchUrl(props.youtubeId));
  }
};
