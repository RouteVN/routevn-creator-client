import {
  buildTabletLandscapeContentColumnStyle,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  ROUTEVN_CREATOR_MOBILE_VIDEO_TUTORIALS_URL,
  ROUTEVN_CREATOR_VIDEO_TUTORIALS_URL,
} from "../../internal/routevnUrls.js";
import { selectTutorialsPageCopy } from "./support/tutorialsPageCopy.js";

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "tutorials",
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

// Phones and tablets get the tutorials recorded on them.
export const selectVideoTutorialsUrl = ({ state }) =>
  state.isTouchMode
    ? ROUTEVN_CREATOR_MOBILE_VIDEO_TUTORIALS_URL
    : ROUTEVN_CREATOR_VIDEO_TUTORIALS_URL;

export const selectViewData = ({ state, i18n }) => {
  const copy = selectTutorialsPageCopy(i18n);

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "md" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    tabletLandscapeContentStyle: buildTabletLandscapeContentColumnStyle(state, {
      minGutter: "var(--spacing-md)",
    }),
    title: copy.title ?? "Tutorials",
    description:
      copy.description ?? "Learn RouteVN Creator with step-by-step videos.",
    watchTutorialsButton: copy.watchTutorialsButton ?? "Watch Video Tutorials",
  };
};
