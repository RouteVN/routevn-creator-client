import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";

export const createInitialState = () => ({
  selectedIndex: 0,
  isOpen: false,
});

export const setSelectedIndex = ({ state }, { index } = {}) => {
  state.selectedIndex = index;
};

// Steps through the gallery and wraps at either end.
export const stepIndex = ({ state }, { step, count } = {}) => {
  if (count < 1) {
    state.selectedIndex = 0;
    return;
  }
  const next = state.selectedIndex + step;
  state.selectedIndex = ((next % count) + count) % count;
};

export const setOpen = ({ state }, { open } = {}) => {
  state.isOpen = open;
};

export const reset = ({ state }) => {
  state.selectedIndex = 0;
  state.isOpen = false;
};

export const selectViewData = ({ state, props, i18n = {} }) => {
  const copy = i18n.assetPackGallery ?? {};
  const title = props.title ?? "";
  const images = props.images ?? [];
  const selectedIndex = Math.min(
    state.selectedIndex,
    Math.max(images.length - 1, 0),
  );
  const position =
    images.length > 0 ? `${selectedIndex + 1} / ${images.length}` : "";
  return {
    images: images.map((src, index) => {
      const selected = index === selectedIndex;
      return {
        src,
        index,
        current: selected ? "true" : "false",
        // The shown image is ringed and at full strength; the rest are dimmed.
        ring: selected ? "pr" : "tr",
        opacity: selected ? "1" : "0.7",
        showLabel: formatI18nCopy(
          copy.showImageLabel ?? "Show image {number}",
          { number: index + 1 },
        ),
      };
    }),
    src: images[selectedIndex],
    hasMany: images.length > 1,
    isOpen: state.isOpen,
    position,
    imagesLabel: copy.imagesLabel ?? "Gallery images",
    openLabel: formatI18nCopy(
      copy.openLabel ?? "View {title}, image {position}, full screen",
      { title, position },
    ),
    previousLabel: copy.previousLabel ?? "Previous image",
    nextLabel: copy.nextLabel ?? "Next image",
    closeLabel: copy.closeLabel ?? "Close full screen",
    dialogLabel: formatI18nCopy(copy.dialogLabel ?? "{title} images", {
      title,
    }),
    imageAlt: formatI18nCopy(copy.imageAlt ?? "{title}, image {position}", {
      title,
      position,
    }),
  };
};
