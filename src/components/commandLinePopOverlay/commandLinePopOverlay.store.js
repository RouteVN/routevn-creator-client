import {
  localizeCommandLineBreadcrumb,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

export const createInitialState = () => ({
  mode: "current",
  initiated: false,
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setInitiated = ({ state }, _payload = {}) => {
  state.initiated = true;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
    { label: "Pop Overlay" },
  ];

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
  };
};
