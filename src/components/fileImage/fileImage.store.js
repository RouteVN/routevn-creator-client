const blacklistedAttrs = ['fileId'];

const stringifyAttrs = (attrs) => {
  return Object.entries(attrs).filter(([key]) => !blacklistedAttrs.includes(key)).map(([key, value]) => `${key}=${value}`).join(' ');
};

export const INITIAL_STATE = Object.freeze({
  src: '/public/project_logo_placeholder.png',
  isLoading: false,
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

export const toViewData = ({ state, attrs }, payload) => {
  return {
    src: state.src,
    isLoading: state.isLoading,
    containerAttrString: stringifyAttrs(attrs),
  };
};