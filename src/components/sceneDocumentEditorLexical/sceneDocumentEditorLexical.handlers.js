const forwardEvent = (dispatchEvent, eventName, detail) => {
  dispatchEvent(
    new CustomEvent(eventName, {
      detail,
    }),
  );
};

const getPayloadDetail = (payload) => {
  return payload?._event?.detail ?? payload?.detail ?? {};
};

const getPayloadEventType = (payload) => {
  return payload?._event?.type ?? payload?.type;
};

const createFuriganaForm = (textStyleOptions = []) => ({
  title: "Add/edit furigana",
  fields: [
    {
      name: "textStyleId",
      type: "select",
      label: "Text Style",
      required: true,
      noClear: true,
      options: textStyleOptions,
    },
    {
      name: "text",
      type: "input-text",
      label: "Furigana Content",
      required: true,
      placeholder: "Enter furigana",
    },
  ],
  actions: {
    buttons: [
      {
        id: "cancel",
        variant: "se",
        label: "Cancel",
        align: "left",
      },
      {
        id: "submit",
        variant: "pr",
        label: "Submit",
        validate: true,
      },
    ],
  },
});

const toTextStyleOptions = (textStyles = []) => {
  return textStyles.map((textStyle) => ({
    value: textStyle.id,
    label: textStyle.name || textStyle.id,
  }));
};

export const handleSceneLinesChanged = (deps, payload) => {
  forwardEvent(
    deps.dispatchEvent,
    "scene-lines-changed",
    getPayloadDetail(payload),
  );
};

export const handleSelectedLineChanged = (deps, payload) => {
  forwardEvent(
    deps.dispatchEvent,
    "selected-line-changed",
    getPayloadDetail(payload),
  );
};

export const handleCompositionStateChanged = (deps, payload) => {
  forwardEvent(
    deps.dispatchEvent,
    "composition-state-changed",
    getPayloadDetail(payload),
  );
};

export const handleEditorBlur = (deps, payload) => {
  forwardEvent(deps.dispatchEvent, "editor-blur", getPayloadDetail(payload));
};

export const handleForwardEditorEvent = (deps, payload) => {
  const eventType = getPayloadEventType(payload);
  if (!eventType) {
    return;
  }

  forwardEvent(deps.dispatchEvent, eventType, getPayloadDetail(payload));
};

export const handleFuriganaDialogRequest = async (deps, payload) => {
  const { appService, refs } = deps;
  const detail = getPayloadDetail(payload);
  const textStyleOptions = toTextStyleOptions(detail.textStyles ?? []);

  if (textStyleOptions.length === 0) {
    refs.editor?.clearPendingRichTextSelection?.();
    appService.showAlert({
      title: "Warning",
      message: "Create a text style before adding furigana.",
    });
    return;
  }

  const dialogResult = await appService.showFormDialog({
    size: "md",
    form: createFuriganaForm(textStyleOptions),
    defaultValues: {
      textStyleId:
        detail.furigana?.textStyleId ??
        detail.defaultTextStyleId ??
        textStyleOptions[0].value,
      text: detail.furigana?.text ?? "",
    },
  });

  if (!dialogResult || dialogResult.actionId !== "submit") {
    refs.editor?.clearPendingRichTextSelection?.();
    return;
  }

  const text = String(dialogResult.values?.text ?? "").trim();
  const textStyleId = dialogResult.values?.textStyleId;
  if (!text || !textStyleId) {
    refs.editor?.clearPendingRichTextSelection?.();
    appService.showAlert({
      title: "Warning",
      message: "Furigana content and text style are required.",
    });
    return;
  }

  refs.editor?.applyFuriganaToSelection?.({
    text,
    textStyleId,
  });
  refs.editor?.focus?.({ preventScroll: true });
};
