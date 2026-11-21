import { buildYouTubeEmbedUrl } from "../../internal/youtube.js";

export const createInitialState = () => ({});

export const selectViewData = ({ props = {}, i18n = {} }) => {
  const copy = i18n.youtubePlayer ?? {};

  return {
    isOpen: Boolean(props.youtubeId),
    title: props.title ?? "",
    embedUrl: props.youtubeId ? buildYouTubeEmbedUrl(props.youtubeId) : "",
    openOnYouTubeButton: copy.openOnYouTubeButton ?? "Open on YouTube",
    closeLabel: copy.closeLabel ?? "Close",
  };
};
