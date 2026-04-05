const propsChanged = (oldProps = {}, newProps = {}) => {
  return (
    oldProps.open !== newProps.open ||
    oldProps.file !== newProps.file ||
    oldProps.title !== newProps.title ||
    oldProps.description !== newProps.description ||
    oldProps.confirmLabel !== newProps.confirmLabel
  );
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.syncFromProps({ props });
};

export const handleOnUpdate = (deps, payload = {}) => {
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  deps.store.syncFromProps({ props: newProps });
  deps.render();
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
  const { store, render } = deps;
  store.setCropReady({
    isReady: payload._event.detail?.isReady === true,
  });
  render();
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
