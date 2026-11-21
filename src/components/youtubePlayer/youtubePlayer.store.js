import { buildYouTubeEmbedUrl } from "../../internal/youtube.js";

export const createInitialState = () => ({
  isMenuOpen: false,
  menuPosition: { x: 0, y: 0 },
});

export const openMenu = ({ state }, { x, y }) => {
  state.isMenuOpen = true;
  state.menuPosition.x = x;
  state.menuPosition.y = y;
};

export const closeMenu = ({ state }) => {
  state.isMenuOpen = false;
};

export const selectViewData = ({ state, props = {}, i18n = {} }) => {
  const copy = i18n.youtubePlayer ?? {};

  return {
    isOpen: Boolean(props.youtubeId),
    title: props.title ?? "",
    embedUrl: props.youtubeId ? buildYouTubeEmbedUrl(props.youtubeId) : "",
    actionsLabel: copy.actionsLabel ?? "Actions",
    closeLabel: copy.closeLabel ?? "Close",
    menu: {
      isOpen: state.isMenuOpen,
      x: state.menuPosition.x,
      y: state.menuPosition.y,
      items: [
        {
          type: "item",
          label: copy.openOnYouTubeButton ?? "Open on YouTube",
          value: "open-on-youtube",
        },
      ],
    },
  };
};
