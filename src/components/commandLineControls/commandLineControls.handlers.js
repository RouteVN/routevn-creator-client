export const handleBeforeMount = (deps) => {
  const { store, render, props } = deps;

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

export const handleDisableClickSelectChange = (e, deps) => {
  const { store, render } = deps;
  const disableUserClick = e.detail.value;

  store.setDisableUserClick({ disableUserClick });
  render();
};

export const handleAutoPlaySelectChange = (e, deps) => {
  const { store, render } = deps;
  const autoPlay = e.detail.value;

  store.setAutoPlay({ autoPlay });
  render();
};

export const handleAutoPlayDelayChange = (e, deps) => {
  const { store, render } = deps;
  const autoPlayDelay = parseInt(e.target.value) || 1000;

  store.setAutoPlayDelay({ autoPlayDelay });
  render();
};

export const handleSubmitClick = (e, deps) => {
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

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
