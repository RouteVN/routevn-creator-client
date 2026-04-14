import { createRuntimeActionSubmitDetail } from "../../internal/runtimeActions.js";

export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  store.setMode({ mode: props?.mode });
  store.setAction({ action: props?.action });
  store.setFormValues({
    values: undefined,
  });
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

  const values = detail.values ?? store.getState().formValues ?? {};
  const mode = store.getState().mode;
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
