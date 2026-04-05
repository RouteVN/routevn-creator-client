const DEFAULT_TITLE = "Crop Image";
const DEFAULT_DESCRIPTION =
  "Drag the image and adjust zoom before saving the image.";
const DEFAULT_CONFIRM_LABEL = "Use Crop";

export const createInitialState = () => ({
  open: false,
  file: undefined,
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  confirmLabel: DEFAULT_CONFIRM_LABEL,
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
  state.title = props?.title ?? DEFAULT_TITLE;
  state.description = props?.description ?? DEFAULT_DESCRIPTION;
  state.confirmLabel = props?.confirmLabel ?? DEFAULT_CONFIRM_LABEL;
};

export const setCropReady = ({ state }, { isReady } = {}) => {
  state.isCropReady = isReady === true;
};

export const selectIsCropReady = ({ state }) => {
  return state.isCropReady;
};

export const selectViewData = ({ state }) => {
  return {
    isOpen: state.open,
    file: state.file,
    title: state.title,
    description: state.description,
    confirmLabel: state.confirmLabel,
    isCropReady: state.isCropReady,
  };
};
