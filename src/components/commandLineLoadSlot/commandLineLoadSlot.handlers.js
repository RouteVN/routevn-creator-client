export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const rawSlotId =
    props?.loadSlot?.slotId ??
    props?.loadSlot?.slot ??
    props?.loadSlot?.slotKey ??
    "";

  store.setDefaultValues({
    slotId: rawSlotId === "" ? undefined : String(rawSlotId),
  });
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { values } = payload._event.detail;

  if (!values) {
    return;
  }

  store.setDefaultValues(values);
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const rawSlotId = store.selectDefaultValues().slotId;
  const slotId =
    typeof rawSlotId === "string" ? rawSlotId.trim() : String(rawSlotId ?? "");
  const detail = {
    loadSlot: {},
  };

  if (slotId) {
    detail.loadSlot.slotId = slotId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail,
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
