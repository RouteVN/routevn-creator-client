// Repeated clicks on the gallery's controls otherwise start a native text
// selection that tints the image. The first press keeps its default focus
// behaviour; right-clicks and keyboard activation are left alone.
export const handleGalleryMouseDown = (_deps, payload) => {
  const { _event } = payload;
  if (_event.button === 0 && _event.detail > 1) {
    _event.preventDefault();
  }
};

// Another pack starts the gallery again at its first image, closed.
export const handleOnUpdate = (deps, payload) => {
  const { store, render } = deps;
  const { oldProps, newProps } = payload;
  if (oldProps.packId === newProps.packId) return;
  store.reset();
  render();
};

// Enter and Space activate role="button" items the same way a click does.
export const handleActivateKeyDown = (_deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "Enter" && _event.key !== " ") return;
  _event.preventDefault();
  _event.currentTarget.click();
};

export const handleThumbnailClick = (deps, payload) => {
  const { store, render } = deps;
  store.setSelectedIndex({
    index: Number(payload._event.currentTarget.dataset.imageIndex),
  });
  render();
};

const stepImage = (deps, step) => {
  const { props, store, render } = deps;
  store.stepIndex({ step, count: props.images?.length ?? 0 });
  render();
};

export const handleStep = (deps, payload) => {
  stepImage(deps, Number(payload._event.currentTarget.dataset.step));
};

// The full-screen view steps with its arrows and the arrow keys. Its close
// button, Escape or a click beside the image closes it, and focus returns to
// the gallery.
export const handleLightboxOpen = (deps) => {
  const { store, render } = deps;
  store.setOpen({ open: true });
  render();
};

export const handleLightboxClose = (deps) => {
  const { store, render, refs } = deps;
  store.setOpen({ open: false });
  render();
  refs.galleryOpen.focus();
};

export const handleLightboxBackdrop = (deps, payload) => {
  const { _event } = payload;
  if (_event.target === _event.currentTarget) {
    handleLightboxClose(deps);
  }
};

export const handleLightboxKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (_event.key !== "ArrowLeft" && _event.key !== "ArrowRight") return;
  _event.preventDefault();
  stepImage(deps, _event.key === "ArrowLeft" ? -1 : 1);
};
