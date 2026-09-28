import { selectTutorialsPageCopy } from "./support/tutorialsPageCopy.js";

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "tutorials",
  isTouchMode: false,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectTutorialsPageCopy(i18n);

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "md" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    title: copy.title ?? "Tutorials",
    description:
      copy.description ?? "Learn RouteVN Creator with step-by-step videos.",
    watchTutorialsButton: copy.watchTutorialsButton ?? "Watch Video Tutorials",
  };
};
