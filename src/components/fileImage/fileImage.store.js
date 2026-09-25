const blacklistedAttrs = [
  "fileId",
  "imageId",
  "source",
  "lazy",
  "lazyRootMargin",
  "originalFileId",
  "showErrorMessage",
];

const stringifyAttrs = (attrs) => {
  return Object.entries(attrs)
    .filter(([key]) => !blacklistedAttrs.includes(key))
    .map(([key, value]) => {
      // Always quote attribute values to handle special characters
      if (typeof value === "string" && value !== "") {
        // Escape any quotes in the value
        const escapedValue = value.replace(/"/g, "&quot;");
        return `${key}="${escapedValue}"`;
      } else if (value === true || value === "") {
        // Boolean attributes
        return key;
      } else if (value === false || value === null || value === undefined) {
        // Don't include false/null/undefined attributes
        return null;
      } else {
        // Other values (numbers, etc)
        return `${key}="${value}"`;
      }
    })
    .filter(Boolean)
    .join(" ");
};

export const createInitialState = () => ({
  src: "",
  isLoading: true,
  loadedFileId: undefined,
  shouldLoad: false,
  isLazyObserved: false,
  hasError: false,
  loadSequence: 0,
  loadedOriginalFileId: undefined,
});

export const beginLoad = ({ state }) => {
  state.loadSequence += 1;
  state.hasError = false;
};

export const invalidateLoad = ({ state }) => {
  state.loadSequence += 1;
};

export const selectLoadSequence = ({ state }) => state.loadSequence;

export const setLoadError = ({ state }, { hasError }) => {
  state.hasError = hasError;
};

export const setLoadedOriginalFileId = ({ state }, { fileId }) => {
  state.loadedOriginalFileId = fileId;
};

export const selectLoadedOriginalFileId = ({ state }) =>
  state.loadedOriginalFileId;

export const setSrc = ({ state }, { src } = {}) => {
  state.src = src;
};

export const setIsLoading = ({ state }, { isLoading } = {}) => {
  state.isLoading = isLoading;
};

export const setLoadedFileId = ({ state }, { fileId } = {}) => {
  state.loadedFileId = fileId;
};

export const setShouldLoad = ({ state }, { shouldLoad } = {}) => {
  state.shouldLoad = shouldLoad;
};

export const setIsLazyObserved = ({ state }, { isLazyObserved } = {}) => {
  state.isLazyObserved = isLazyObserved;
};

export const selectSrc = ({ state }) => {
  return state.src;
};

export const selectIsLoading = ({ state }) => {
  return state.isLoading;
};

export const selectLoadedFileId = ({ state }) => {
  return state.loadedFileId;
};

export const selectShouldLoad = ({ state }) => {
  return state.shouldLoad;
};

export const selectIsLazyObserved = ({ state }) => {
  return state.isLazyObserved;
};

export const selectViewData = ({ state, props: attrs, i18n = {} }) => {
  const { style: _style, bc = "fg", ...restAttrs } = attrs;
  return {
    src: state.src,
    hasSrc: Boolean(state.src) && (!attrs.originalFileId || !state.isLoading),
    hasError: state.hasError,
    showErrorMessage: attrs.showErrorMessage,
    unavailableLabel: i18n.fileImage?.unavailableLabel ?? "Image unavailable",
    reuploadMessage:
      i18n.fileImage?.reuploadMessage ??
      "Open Edit and re-upload this image file.",
    isLoading: state.isLoading,
    borderColor: bc,
    containerAttrString: stringifyAttrs(restAttrs),
    key: attrs.key,
    bw: attrs.bw,
    cur: attrs.cur,
  };
};
