export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  // Initialize with existing controls data if available
  if (props?.line?.controls?.disableUserClick !== undefined) {
    store.setDisableUserClick({
      disableUserClick: props.line.controls.disableUserClick,
    });
  }

  if (props?.line?.controls?.autoPlay !== undefined) {
    store.setAutoPlay({
      autoPlay: props.line.controls.autoPlay,
    });
  }

  if (props?.line?.controls?.autoPlayDelay !== undefined) {
    store.setAutoPlayDelay({
      autoPlayDelay: props.line.controls.autoPlayDelay,
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const formData = payload._event.detail.formData;

  if (formData.disableUserClick !== undefined) {
    store.setDisableUserClick({ disableUserClick: formData.disableUserClick });
  }

  if (formData.autoPlay !== undefined) {
    store.setAutoPlay({ autoPlay: formData.autoPlay });
  }

  if (formData.autoPlayDelay !== undefined) {
    const autoPlayDelay = parseInt(formData.autoPlayDelay) || 1000;
    store.setAutoPlayDelay({ autoPlayDelay });
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const { disableUserClick, autoPlay, autoPlayDelay } = store.getState();

  // Create controls object with the configured values
  const controls = {
    disableUserClick,
    autoPlay,
    autoPlayDelay,
  };

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        controls,
      },
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
