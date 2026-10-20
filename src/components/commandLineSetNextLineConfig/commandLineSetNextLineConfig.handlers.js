export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  if (props?.setNextLineConfig) {
    const config = props.setNextLineConfig;
    store.setDefaultValues({
      applyMode: config.applyMode ?? "singleLine",
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
  const { values: formValues } = payload._event.detail;

  store.setDefaultValues(formValues);
  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const defaultValues = store.selectDefaultValues();

  // Validate delay on submit - default to 1000 if empty or invalid
  const delay = parseInt(defaultValues.autoDelay, 10) || 1000;

  // The form has no field for this yet, so a new config has no value for it.
  // A saved change cannot hold undefined, so the field is then left out.
  const manual = {
    enabled: defaultValues.manualEnabled,
  };
  if (defaultValues.manualRequireLineCompleted !== undefined) {
    manual.requireLineCompleted = defaultValues.manualRequireLineCompleted;
  }

  const setNextLineConfig = {
    applyMode: defaultValues.applyMode ?? "singleLine",
    manual,
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
