const blacklistedAttrs = [
  "fileId",
  "imageId",
  "source",
  "lazy",
  "lazyRootMargin",
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
});

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

export const selectViewData = ({ state, props: attrs }) => {
  const { style: _style, bc = "fg", ...restAttrs } = attrs;
  return {
    src: state.src,
    hasSrc: Boolean(state.src),
    isLoading: state.isLoading,
    borderColor: bc,
    containerAttrString: stringifyAttrs(restAttrs),
    key: attrs.key,
    bw: attrs.bw,
    cur: attrs.cur,
  };
};
