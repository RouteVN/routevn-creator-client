const blacklistedAttrs = ["fileId", "imageId"];

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
  src: "/public/project_logo_placeholder.png",
  isLoading: true,
});

export const setSrc = (state, src) => {
  state.src = src;
};

export const setIsLoading = (state, isLoading) => {
  state.isLoading = isLoading;
};

export const selectSrc = (state) => {
  return state.src;
};

export const selectIsLoading = (state) => {
  return state.isLoading;
};

export const selectViewData = ({ state, attrs, props }, payload) => {
  const { style, ...restAttrs } = attrs;
  return {
    src: state.src,
    isLoading: state.isLoading,
    containerAttrString: stringifyAttrs(restAttrs),
    key: attrs.key,
    bw: attrs.bw,
  };
};
