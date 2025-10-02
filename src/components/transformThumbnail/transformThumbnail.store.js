export const selectViewData = ({ attrs }) => {
  return {
    w: attrs.w || "320",
    h: attrs.h || "180",
  };
};
