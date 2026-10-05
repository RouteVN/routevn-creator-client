import { concatMap, debounceTime, filter, from } from "rxjs";
import { buildFontResourceDataFromUploadResult } from "../../deps/services/shared/resourceImports.js";
import {
  extractFontWeightCapabilities,
  inspectNewFontFile,
  isFontWeightSupported,
  isStrictFontMimeType,
} from "../../internal/fontCapabilities.js";
import { normalizeFontFileType } from "../../internal/fileTypes.js";
import { generateId } from "../../internal/id.js";
import {
  createTextStyleEditorPayload,
  getTextStyleEditorBackPath,
  resolveTextStyleEditorPayload,
} from "../../internal/textStyleEditorRoute.js";
import { showAssetLoadFailures } from "../../internal/ui/assetLoadFeedback.js";
import { resolveEditHistoryShortcut } from "../../internal/ui/editHistory.js";
import { getMediaPageData } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { forwardFormSubmitOnEnter } from "../../internal/ui/resourcePages/formSubmitKeyDown.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { enqueueSceneEditorPersistence } from "../../internal/ui/sceneEditor/persistenceQueue.js";
import {
  applyTextStyleColorChange,
  applyTextStyleFontChange,
  applyTextStyleFormChange,
  toTextStyleUpdateData,
} from "./support/textStyleEditorForm.js";
import { selectTextStyleEditorPageCopy } from "./support/textStyleEditorPageCopy.js";

const selectCopy = ({ i18n } = {}) => selectTextStyleEditorPageCopy(i18n);

// Edits save on their own once the values have been still this long.
const AUTOSAVE_DEBOUNCE_MS = 300;
const AUTOSAVE_ACTION = "textStyleEditor.autosave";

const navigateBack = (appService) => {
  appService.navigate(
    getTextStyleEditorBackPath(),
    createTextStyleEditorPayload({
      payload: appService.getPayload() ?? {},
    }),
    { historyMode: "replace" },
  );
};

// The colors and fonts the form offers and the preview draws with.
const selectResourceData = (repositoryState) => ({
  colorsData: repositoryState.colors,
  fontsData: getMediaPageData({
    repositoryState,
    resourceType: "fonts",
  }),
});

// The weights a font can draw, read once per font from its saved metadata
// or its file. A font whose weights cannot be read allows every weight.
const loadFontCapabilities = async (deps, { fontId } = {}) => {
  const { projectService, store } = deps;
  if (!fontId) {
    return undefined;
  }

  const cachedCapabilities = store.selectFontCapabilities({ fontId });
  if (cachedCapabilities) {
    return cachedCapabilities.kind === "unrestricted"
      ? undefined
      : cachedCapabilities;
  }

  const font = store.selectFontById({ fontId });
  if (!font?.fileId) {
    return undefined;
  }

  if (
    font.minWeight !== undefined &&
    font.defaultWeight !== undefined &&
    font.maxWeight !== undefined
  ) {
    const capabilities = {
      kind: font.minWeight === font.maxWeight ? "static" : "variable",
      minWeight: font.minWeight,
      defaultWeight: font.defaultWeight,
      maxWeight: font.maxWeight,
    };
    store.setFontCapabilities({ fontId, capabilities });
    return capabilities;
  }

  const mimeType = normalizeFontFileType({
    fileType: font.fileType,
    fileName: font.name,
  });
  if (!isStrictFontMimeType(mimeType)) {
    store.setFontCapabilities({
      fontId,
      capabilities: { kind: "unrestricted" },
    });
    return undefined;
  }

  let content;
  try {
    content = await projectService.getFileContent(font.fileId);
    const response = await fetch(content.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const capabilities = extractFontWeightCapabilities(
      await response.arrayBuffer(),
    );
    store.setFontCapabilities({ fontId, capabilities });
    return capabilities;
  } catch (error) {
    console.warn(
      `Could not inspect font capabilities for ${font.fileId}.`,
      error,
    );
    store.setFontCapabilities({
      fontId,
      capabilities: { kind: "unrestricted" },
    });
    return undefined;
  } finally {
    content?.revoke?.();
  }
};

// Saves the text style's values when they differ from what is saved: how
// the text looks, never its name or preview text. Saves run one at a time,
// so a save on leaving waits for a running autosave and then saves what it
// missed.
const saveTextStyleValues = (deps) => {
  const { appService, projectService, store } = deps;
  return enqueueSceneEditorPersistence({
    owner: projectService,
    task: async () => {
      if (!store.selectHasUnsavedValues()) {
        return true;
      }

      const copy = selectCopy(deps);
      const values = store.selectValues();
      const updateAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: copy.failedSaveTextStyle,
        title: copy.errorTitle,
        action: () =>
          projectService.updateTextStyle({
            textStyleId: store.selectTextStyleId(),
            data: toTextStyleUpdateData(values),
          }),
      });
      if (updateAttempt.ok) {
        store.markValuesSaved({ values });
      }
      return updateAttempt.ok;
    },
  });
};

const queueTextStyleAutosave = ({ subject }) => {
  subject.dispatch(AUTOSAVE_ACTION, {});
};

// Every edit to the text style ends here, so this is where it enters the
// undo history.
const commitTextStyleEdit = (deps) => {
  const { render, store } = deps;
  store.recordTextStyleEdit({ time: Date.now() });
  queueTextStyleAutosave(deps);
  render();
};

// Picks a font. When the font cannot draw the text style's weight, the
// weight moves to the font's own, in the same undo step; a weight the text
// style already had with this font stays.
const applyFontSelection = async (deps, { fontId } = {}) => {
  const { render, store } = deps;
  store.setValues({
    values: applyTextStyleFontChange(store.selectValues(), { fontId }),
  });
  render();

  const capabilities = await loadFontCapabilities(deps, { fontId });
  // A font picked while this one loaded records both.
  if (store.selectPrimaryFontId() !== fontId) {
    return;
  }

  const { fontWeight } = store.selectValues();
  if (
    capabilities &&
    capabilities.kind !== "unavailable" &&
    !isFontWeightSupported(capabilities, fontWeight) &&
    !store.selectKeepsOpenedFontWeight({ fontId, fontWeight })
  ) {
    store.setValues({
      values: applyTextStyleFontChange(store.selectValues(), {
        fontWeight: capabilities.defaultWeight,
      }),
    });
    store.refreshForm();
  }
  commitTextStyleEdit(deps);
};

const applyColorSelection = (deps, { field, colorId } = {}) => {
  const { store } = deps;
  store.setValues({
    values: applyTextStyleColorChange(store.selectValues(), {
      field,
      colorId,
    }),
  });
  commitTextStyleEdit(deps);
};

const mountSubscriptions = (deps) => {
  const { subject } = deps;
  const subscriptions = [
    subject
      .pipe(
        filter(({ action }) => action === AUTOSAVE_ACTION),
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        concatMap(() => from(saveTextStyleValues(deps))),
      )
      .subscribe(),
  ];
  return () =>
    subscriptions.forEach((subscription) => subscription.unsubscribe());
};

export const handleBeforeMount = (deps) => {
  const {
    appService,
    browserEventsClient,
    render,
    store,
    uiConfig,
    windowMetricsClient,
  } = deps;
  store.setUiConfig({ uiConfig });
  const cleanupSubscriptions = mountSubscriptions(deps);
  // Turning a tablet moves the Edit and Preview panel between the right
  // side and under the preview.
  const cleanupWindowLayout = mountMobileResourceWindowLayout({
    windowMetricsClient,
    store,
    render,
  });
  const cleanupKeyboardShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) => handleWindowKeyDown(deps, { _event: event }),
  });
  // Unsaved preview text is left behind, as unsaved preview settings are
  // in the other editors.
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async () => {
      const saved = await saveTextStyleValues(deps);
      if (!saved) {
        throw new Error("Failed to save text style before navigation.");
      }
    },
  );

  return async () => {
    unregisterBeforeNavigation();
    cleanupSubscriptions();
    cleanupWindowLayout?.();
    cleanupKeyboardShortcuts();
    // The preview draws with a renderer of its own, which it releases when
    // the page leaves, so no shared renderer waits on the save below.
    const saved = await saveTextStyleValues(deps);
    if (!saved) {
      throw new Error("Failed to save text style during cleanup.");
    }
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  await projectService.ensureRepository();
  const { textStyleId } = resolveTextStyleEditorPayload(
    appService.getPayload() ?? {},
  );
  const repositoryState = projectService.getRepositoryState();
  const item = repositoryState.textStyles?.items?.[textStyleId];
  if (item?.type !== "textStyle") {
    appService.showAlert({
      title: copy.errorTitle,
      message: copy.textStyleNotFound,
    });
    navigateBack(appService);
    return;
  }

  store.loadTextStyle({
    item,
    ...selectResourceData(repositoryState),
  });
  render();
  // The weights the font can draw fill the weight options.
  await loadFontCapabilities(deps, { fontId: store.selectPrimaryFontId() });
  render();
};

// Undo and redo behave like an edit: the page shows the restored values at
// once and saves them a moment after. An undo back to the saved values
// leaves nothing to save.
const runTextStyleHistoryStep = (deps, direction) => {
  const { render, store } = deps;
  if (!store.selectEditHistoryStep({ direction })) {
    return;
  }
  store.applyEditHistoryStep({ direction });
  queueTextStyleAutosave(deps);
  render();
};

export const handleUndoButtonClick = (deps) =>
  runTextStyleHistoryStep(deps, "undo");

export const handleRedoButtonClick = (deps) =>
  runTextStyleHistoryStep(deps, "redo");

// Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes, except in a text field or
// a dialog.
export const handleWindowKeyDown = (deps, payload) => {
  const event = payload._event;
  const direction = resolveEditHistoryShortcut(event);
  if (!direction) {
    return;
  }

  event.preventDefault();
  runTextStyleHistoryStep(deps, direction);
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  const saved = await saveTextStyleValues(deps);
  if (saved) {
    navigateBack(appService);
  }
};

export const handleRightPanelModeChange = (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;
  store.setRightPanelMode({ mode: id });
  render();
};

// The form holds only the fields that show, so only the field that changed
// applies, onto the values as they are.
export const handleTextStyleFormChange = (deps, payload) => {
  const { store } = deps;
  const { name, value } = payload._event.detail;
  const { values, refreshForm } = applyTextStyleFormChange(
    store.selectValues(),
    { name, value },
  );
  store.setValues({ values });
  // A value the text style keeps differently from how it was typed, such
  // as an empty font size, shows as it is kept.
  if (refreshForm) {
    store.refreshForm();
  }
  commitTextStyleEdit(deps);
};

export const handleFontSelectChange = async (deps, payload) => {
  const { value } = payload._event.detail;
  if (!value) {
    return;
  }

  await applyFontSelection(deps, { fontId: value });
};

// The color selects name the value they set in data-color-field.
export const handleColorSelectChange = (deps, payload) => {
  const { value } = payload._event.detail;
  const { colorField } = payload._event.currentTarget.dataset;
  applyColorSelection(deps, { field: colorField, colorId: value });
};

export const handleColorSelectAddOptionClick = (deps, payload) => {
  const { render, store } = deps;
  const { colorField } = payload._event.currentTarget.dataset;
  store.openAddColorDialog({ field: colorField });
  render();
};

export const handleFontSelectAddOptionClick = (deps) => {
  const { render, store } = deps;
  store.openAddFontDialog();
  render();
};

// A font file the preview cannot load is left out, so the text draws in
// the next font of the style, or the browser's; the rest of the page stays
// editable. Each file is warned about once while the page is open.
export const handlePreviewFontLoadError = (deps, payload) => {
  const { render, store } = deps;
  const { failures } = payload._event.detail;
  const warnedFileIds = store.selectWarnedFontFileIds();
  const newFailures = failures.filter(
    ({ fileId }) => !warnedFileIds.includes(fileId),
  );
  store.markFontFilesFailed({
    fileIds: failures.map(({ fileId }) => fileId),
  });
  if (newFailures.length > 0) {
    store.markFontWarningsShown({
      fileIds: newFailures.map(({ fileId }) => fileId),
    });
    showAssetLoadFailures(deps, newFailures);
  }
  render();
};

export const handlePreviewTextInput = (deps, payload) => {
  const { render, store } = deps;
  const { value } = payload._event.detail;
  store.setPreviewText({ previewText: value ?? "" });
  render();
};

// Saves the preview text, which the text styles page shows, after the
// values. The button is disabled while it saves, so a double click saves
// once.
export const handleSavePreviewClick = async (deps) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  if (store.selectIsSavingPreview()) {
    return;
  }

  store.startSavingPreview();
  render();
  try {
    if (!(await saveTextStyleValues(deps))) {
      return;
    }

    const previewText = store.selectPreviewText();
    if (store.selectHasUnsavedPreviewText()) {
      const updateAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: copy.failedSavePreview,
        title: copy.errorTitle,
        action: () =>
          projectService.updateTextStyle({
            textStyleId: store.selectTextStyleId(),
            data: { previewText },
          }),
      });
      if (!updateAttempt.ok) {
        return;
      }
      store.markPreviewTextSaved({ previewText });
    }
    appService.showToast({ message: copy.textStylePreviewSaved });
  } finally {
    store.finishSavingPreview();
    render();
  }
};

export const handleAddColorDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddColorDialog();
  render();
};

// Creates the color, and picks it in the select that opened the dialog, as
// one edit.
export const handleAddColorSubmitClick = async (deps) => {
  const { appService, projectService, refs, render, store } = deps;
  const { addColorForm } = refs;
  const copy = selectCopy(deps);
  const values = addColorForm.getValues();
  const name = values.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.colorNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const colorId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedCreateColor,
    title: copy.errorTitle,
    action: () =>
      projectService.createColor({
        colorId,
        data: {
          type: "color",
          name,
          description: values.description ?? "",
          hex: values.hex,
        },
        parentId: values.folderId,
        position: "last",
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  const field = store.selectAddColorDialogField();
  store.setResourceData(
    selectResourceData(projectService.getRepositoryState()),
  );
  store.closeAddColorDialog();
  render();
  applyColorSelection(deps, { field, colorId });
};

export const handleAddColorFormSubmitKeyDown = (deps, payload) =>
  forwardFormSubmitOnEnter({
    deps,
    payload,
    submit: handleAddColorSubmitClick,
  });

export const handleAddFontDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddFontDialog();
  render();
};

const showInvalidFontFormatAlert = (deps) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  appService.showAlert({
    message: copy.invalidFormatMessage,
    title: copy.warningTitle,
  });
};

// The font file uploads as soon as it is picked, with the weights read
// from it.
export const handleFontFileSelected = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const [file] = payload._event.detail.files ?? [];
  if (!file) {
    return;
  }

  let fontCapabilities;
  try {
    fontCapabilities = await inspectNewFontFile(file);
  } catch (error) {
    if (error?.code === "unsupported_font_format") {
      showInvalidFontFormatAlert(deps);
      return;
    }

    appService.showAlert({
      message: copy.invalidFontMessage,
      title: copy.warningTitle,
    });
    return;
  }

  let uploadResults;
  try {
    uploadResults = await projectService.uploadFiles([file]);
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedUploadFontFile,
    });
    return;
  }
  if (uploadResults.length === 0) {
    showResourcePageError({
      appService,
      errorOrResult: copy.failedUploadFontFile,
      fallbackMessage: copy.failedUploadFontFile,
    });
    return;
  }

  const [uploadResult] = uploadResults;
  uploadResult.fontCapabilities = fontCapabilities;
  store.setSelectedFontFile({
    fileName: file.name.replace(/\.(ttf|otf|woff2)$/i, ""),
    uploadResult,
  });
  render();
};

export const handleFontFileRejected = (deps, payload) => {
  const files = payload._event.detail?.files ?? [];
  if (files.length === 0) {
    return;
  }

  showInvalidFontFormatAlert(deps);
};

// Creates the font from the uploaded file, and picks it, as one edit.
export const handleAddFontSubmitClick = async (deps) => {
  const { appService, projectService, refs, render, store } = deps;
  const { addFontForm } = refs;
  const copy = selectCopy(deps);
  const values = addFontForm.getValues();
  const { fileName, uploadResult } = store.selectSelectedFontFile();
  if (!uploadResult) {
    appService.showAlert({
      message: copy.selectFontFile,
      title: copy.warningTitle,
    });
    return;
  }

  const fontId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedCreateFont,
    title: copy.errorTitle,
    action: () =>
      projectService.createFont({
        fontId,
        fileRecords: uploadResult.fileRecords,
        data: buildFontResourceDataFromUploadResult({
          uploadResult,
          name: fileName,
          description: values.description ?? "",
          fontFamily: fileName,
        }),
        parentId: values.folderId,
        position: "last",
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.setResourceData(
    selectResourceData(projectService.getRepositoryState()),
  );
  store.setFontCapabilities({
    fontId,
    capabilities: uploadResult.fontCapabilities,
  });
  store.closeAddFontDialog();
  render();
  await applyFontSelection(deps, { fontId });
};

export const handleAddFontFormSubmitKeyDown = (deps, payload) =>
  forwardFormSubmitOnEnter({
    deps,
    payload,
    submit: handleAddFontSubmitClick,
  });
