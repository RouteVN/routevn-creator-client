export const MOBILE_SAFE_AREA_INSET_TOP_VAR =
  "--rvn-mobile-safe-area-inset-top";
export const MOBILE_SAFE_AREA_INSET_BOTTOM_VAR =
  "--rvn-mobile-safe-area-inset-bottom";

export const MOBILE_SAFE_AREA_INSET_TOP_VALUE =
  "var(--rvn-mobile-safe-area-inset-top, 0px)";
export const MOBILE_SAFE_AREA_INSET_BOTTOM_VALUE =
  "var(--rvn-mobile-safe-area-inset-bottom, 0px)";

export const configureMobileSafeAreaInsets = ({
  top = "0px",
  bottom = "0px",
} = {}) => {
  const style = globalThis.document?.documentElement?.style;
  style?.setProperty(MOBILE_SAFE_AREA_INSET_TOP_VAR, top);
  style?.setProperty(MOBILE_SAFE_AREA_INSET_BOTTOM_VAR, bottom);
};
