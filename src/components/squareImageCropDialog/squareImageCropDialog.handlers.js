const propsChanged = (oldProps = {}, newProps = {}) => {
  return (
    oldProps.open !== newProps.open ||
    oldProps.file !== newProps.file ||
    oldProps.title !== newProps.title ||
    oldProps.description !== newProps.description ||
    oldProps.confirmLabel !== newProps.confirmLabel
  );
};

const syncConfirmButtonState = ({ refs }, isReady) => {
  const confirmButton = refs.confirmButton;
  if (!confirmButton) {
    return;
  }

  confirmButton.disabled = isReady !== true;
  if (isReady === true) {
    confirmButton.removeAttribute("disabled");
    return;
  }

  confirmButton.setAttribute("disabled", "");
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.syncFromProps({ props });
  syncConfirmButtonState(deps, store.selectIsCropReady());
};

export const handleOnUpdate = (deps, payload = {}) => {
  const { store, render } = deps;
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  store.syncFromProps({ props: newProps });
  render();
  syncConfirmButtonState(deps, store.selectIsCropReady());
};

export const handleDialogClose = ({ dispatchEvent }) => {
  dispatchEvent(
    new CustomEvent("close", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleCropperReadyStateChanged = (deps, payload) => {
  const { store } = deps;
  const isReady = payload._event.detail?.isReady === true;

  if (store.selectIsCropReady() === isReady) {
    return;
  }

  store.setCropReady({ isReady });
  syncConfirmButtonState(deps, isReady);
};

export const handleConfirmClick = ({ dispatchEvent, store }) => {
  if (!store.selectIsCropReady()) {
    return;
  }

  dispatchEvent(
    new CustomEvent("confirm", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleGetCroppedFile = async ({ refs }) => {
  return refs.cropper?.getCroppedFile?.();
};
