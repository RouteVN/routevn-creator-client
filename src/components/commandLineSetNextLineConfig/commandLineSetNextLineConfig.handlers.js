export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  if (props?.setNextLineConfig) {
    const config = props.setNextLineConfig;
    store.setDefaultValues({
      manualEnabled: (config.manual?.enabled ?? true) ? "yes" : "no",
      manualRequireLineCompleted:
        (config.manual?.requireLineCompleted ?? false) ? "yes" : "no",
      autoEnabled: (config.auto?.enabled ?? false) ? "yes" : "no",
      autoTrigger: config.auto?.trigger ?? "fromComplete",
      autoDelay: String(config.auto?.delay ?? 1000),
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { formValues } = payload._event.detail;

  store.setDefaultValues(formValues);
  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const defaultValues = store.selectDefaultValues();

  // Validate delay on submit - default to 1000 if empty or invalid
  const delay = parseInt(defaultValues.autoDelay, 10) || 1000;

  const setNextLineConfig = {
    manual: {
      enabled: defaultValues.manualEnabled === "yes",
      requireLineCompleted: defaultValues.manualRequireLineCompleted === "yes",
    },
    auto: {
      enabled: defaultValues.autoEnabled === "yes",
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
