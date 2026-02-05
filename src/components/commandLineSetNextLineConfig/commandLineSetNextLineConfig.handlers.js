export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  if (props?.setNextLineConfig) {
    const config = props.setNextLineConfig;
    store.setDefaultValues({
      manualEnabled: config.manual?.enabled ?? true,
      manualRequireLineCompleted: config.manual?.requireLineCompleted ?? false,
      autoEnabled: config.auto?.enabled ?? false,
      autoTrigger: config.auto?.trigger ?? "fromComplete",
      autoDelay: config.auto?.delay ?? 1000,
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, value } = payload._event.detail;

  store.setDefaultValues({ [name]: value });
  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const defaultValues = store.selectDefaultValues();

  // Validate delay on submit - default to 1000 if empty or invalid
  const delay = parseInt(defaultValues.autoDelay, 10) || 1000;

  const setNextLineConfig = {
    manual: {
      enabled: defaultValues.manualEnabled,
      requireLineCompleted: defaultValues.manualRequireLineCompleted,
    },
    auto: {
      enabled: defaultValues.autoEnabled,
      trigger: defaultValues.autoTrigger,
      delay,
    },
  };

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        setNextLineConfig,
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
