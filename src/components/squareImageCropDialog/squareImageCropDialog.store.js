const DEFAULT_TITLE = "Crop Image";
const DEFAULT_DESCRIPTION =
  "Drag the image and adjust zoom before saving the image.";
const DEFAULT_CONFIRM_LABEL = "Use Crop";

export const createInitialState = () => ({
  open: false,
  file: undefined,
  outputSize: undefined,
  title: undefined,
  description: undefined,
  confirmLabel: undefined,
  isCropReady: false,
});

export const syncFromProps = ({ state }, { props } = {}) => {
  const nextFile = props?.file;
  const nextOpen = props?.open === true;

  if (!nextOpen || state.file !== nextFile) {
    state.isCropReady = false;
  }

  state.open = props?.open === true;
  state.file = nextFile;
  state.outputSize = props?.outputSize;
  state.title = props?.title;
  state.description = props?.description;
  state.confirmLabel = props?.confirmLabel;
};

export const setCropReady = ({ state }, { isReady } = {}) => {
  state.isCropReady = isReady === true;
};

export const selectIsCropReady = ({ state }) => {
  return state.isCropReady;
};

// Callers may pass their own text; otherwise the dialog uses the shared copy.
export const selectViewData = ({ state, i18n = {} }) => {
  const copy = i18n.resourcePages ?? {};
  return {
    isOpen: state.open,
    file: state.file,
    outputSize: state.outputSize,
    title: state.title ?? copy.cropImageTitle ?? DEFAULT_TITLE,
    description:
      state.description ?? copy.cropImageDescription ?? DEFAULT_DESCRIPTION,
    confirmLabel:
      state.confirmLabel ?? copy.useCropButton ?? DEFAULT_CONFIRM_LABEL,
    isCropReady: state.isCropReady,
  };
};
