import {
  createRuntimeActionDefaultValues,
  createRuntimeActionSubmitDetail,
} from "../../internal/runtimeActions.js";

const syncFormValues = (deps) => {
  const { refs, store } = deps;
  const { mode, action } = store.selectSubmitData();

  refs.form.reset();
  refs.form.setValues({
    values: createRuntimeActionDefaultValues(mode, action),
  });
};

export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  store.setMode({ mode: props?.mode });
  store.setAction({ action: props?.action });
  store.setFormValues({
    values: undefined,
  });
};

export const handleAfterMount = (deps) => {
  syncFormValues(deps);
};

export const handleOnUpdate = (deps, payload) => {
  const { newProps = {} } = payload;
  const { store, render } = deps;

  store.setMode({ mode: newProps.mode });
  store.setAction({ action: newProps.action });
  store.setFormValues({
    values: undefined,
  });
  render();
  syncFormValues(deps);
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const values = payload?._event?.detail?.values ?? {};
  store.setFormValues({ values });
  render();
};

export const handleSubmitClick = (deps, payload) => {
  const { dispatchEvent, store } = deps;
  const detail = payload?._event?.detail ?? {};
  if (detail.actionId && detail.actionId !== "submit") {
    return;
  }

  const { mode, action, formValues } = store.selectSubmitData();
  const values =
    detail.values ??
    (Object.keys(formValues ?? {}).length > 0
      ? formValues
      : createRuntimeActionDefaultValues(mode, action));
  const submitDetail = createRuntimeActionSubmitDetail(mode, values);

  if (!submitDetail) {
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: submitDetail,
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
