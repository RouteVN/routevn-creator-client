export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const rawSlotId =
    props?.saveSlot?.slotId ??
    props?.saveSlot?.slot ??
    props?.saveSlot?.slotKey ??
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
  const { dispatchEvent, refs } = deps;
  const { form } = refs;

  if (!form.validate().valid) {
    return;
  }

  // Read the form itself: form-change only fires once the field commits, so
  // a slot typed just before Submit may not have reached the store yet.
  const rawSlotId = form.getValues().slotId;
  const slotId =
    typeof rawSlotId === "string" ? rawSlotId.trim() : String(rawSlotId ?? "");
  const detail = {
    saveSlot: {},
  };

  if (slotId) {
    detail.saveSlot.slotId = slotId;
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
