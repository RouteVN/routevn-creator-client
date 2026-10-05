import {
  areEditHistoryValuesEqual,
  createEditHistory,
  getEditHistoryChangeKey,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../internal/editHistory.js";
import {
  getFontFaceWeightDescriptor,
  NEW_FONT_FILE_TYPES,
} from "../../internal/fontCapabilities.js";
import { toPrimaryFontId } from "../../internal/fontIds.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { selectEditHistoryCopy } from "../../internal/ui/editHistory.js";
import { selectShowEditorRightPanelState } from "../../internal/ui/editorCanvasWorkspace.js";
import {
  isTouchUiConfig,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  buildFontWeightOptions,
  buildTextStyleFormValues,
  createTextStyleForm,
  toTextStyleValues,
} from "./support/textStyleEditorForm.js";
import { selectTextStyleEditorPageCopy } from "./support/textStyleEditorPageCopy.js";
import {
  createAddColorDefaultValues,
  createAddColorForm,
  createAddFontDefaultValues,
  createAddFontForm,
  createFolderOptions,
} from "./support/textStyleEditorResourceForms.js";

// As in the other editors, the right panel shows the text style's values
// (Edit) or the preview text and Save Preview (Preview).
const RIGHT_PANEL_MODES = new Set(["edit", "preview"]);

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const createEmptyValues = () =>
  toTextStyleValues({
    fontId: [],
    fontSize: 16,
    lineHeight: 1.5,
    fontWeight: "400",
  });

const createAddColorDialog = () => ({
  open: false,
  // The color select that opened the dialog, which gets the new color.
  field: undefined,
});

const createAddFontDialog = () => ({
  open: false,
  // The file is uploaded as soon as it is picked; Add Font creates the
  // font from the upload.
  fileName: "",
  uploadResult: undefined,
});

// A font's weights are read once per file; a changed file reads them again.
const getFontCapabilityCacheSignature = (font) => {
  if (!font) {
    return "";
  }

  return JSON.stringify([
    font.fileId,
    font.fileType,
    font.name,
    font.minWeight,
    font.defaultWeight,
    font.maxWeight,
  ]);
};

const getFontItem = (fontsData, fontId) => {
  const font = fontsData.items[fontId];
  return font?.type === "font" ? font : undefined;
};

const getColorHex = (colorsData, colorId) => {
  const color = colorsData.items[colorId];
  return color?.type === "color" ? color.hex : "#000000";
};

export const createInitialState = () => ({
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
  textStyleId: undefined,
  textStyleName: "",
  values: createEmptyValues(),
  // The values as last saved; edits save on their own, a moment after.
  savedValues: undefined,
  // The font and weight the text style had when the page opened. That
  // weight stays available with that font even when the font cannot draw
  // it, as it was before.
  openedFont: { fontId: undefined, fontWeight: undefined },
  // The preview text saves only with Save Preview, and is not part of the
  // undo history.
  previewText: "",
  // How the editor preview aligns its text; only for this visit.
  previewAlign: "center",
  savedPreviewText: "",
  rightPanelMode: "edit",
  // Remounts the form, for values that change outside it (undo, redo, a
  // weight the new font cannot draw) or that it shows differently from how
  // they were typed.
  formRevision: 0,
  // Undo and redo for edits made since the page opened.
  editHistory: createEditHistory(),
  editHistoryBaseline: undefined,
  colorsData: createEmptyCollection(),
  fontsData: createEmptyCollection(),
  fontCapabilitiesById: {},
  // Font files that failed to load; the preview draws without them.
  failedFontFileIds: [],
  warnedFontFileIds: [],
  // Save Preview runs once at a time.
  isSavingPreview: false,
  addColorDialog: createAddColorDialog(),
  addFontDialog: createAddFontDialog(),
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

export const loadTextStyle = (
  { state },
  { item, colorsData, fontsData } = {},
) => {
  state.textStyleId = item.id;
  state.textStyleName = item.name ?? "";
  state.values = toTextStyleValues(item);
  state.savedValues = state.values;
  state.openedFont = {
    fontId: toPrimaryFontId(item.fontId),
    fontWeight: state.values.fontWeight,
  };
  state.previewText = item.previewText ?? "";
  state.savedPreviewText = state.previewText;
  state.editHistory = createEditHistory();
  state.editHistoryBaseline = state.values;
  state.colorsData = colorsData ?? createEmptyCollection();
  state.fontsData = fontsData ?? createEmptyCollection();
  state.failedFontFileIds = [];
  state.warnedFontFileIds = [];
};

// The colors and fonts after one was added from the editor.
export const setResourceData = ({ state }, { colorsData, fontsData } = {}) => {
  const nextFontsData = fontsData ?? createEmptyCollection();
  for (const fontId of Object.keys(state.fontCapabilitiesById)) {
    if (
      getFontCapabilityCacheSignature(state.fontsData.items[fontId]) !==
      getFontCapabilityCacheSignature(nextFontsData.items[fontId])
    ) {
      delete state.fontCapabilitiesById[fontId];
    }
  }
  state.colorsData = colorsData ?? createEmptyCollection();
  state.fontsData = nextFontsData;
};

export const selectTextStyleId = ({ state }) => state.textStyleId;

export const selectValues = ({ state }) => state.values;

export const selectPrimaryFontId = ({ state }) =>
  toPrimaryFontId(state.values.fontId);

// Whether `fontWeight` is the weight the text style had with `fontId` when
// the page opened, which stays available even when the font cannot draw it.
export const selectKeepsOpenedFontWeight = (
  { state },
  { fontId, fontWeight } = {},
) =>
  state.openedFont.fontId === fontId &&
  state.openedFont.fontWeight === String(fontWeight);

export const selectHasUnsavedValues = ({ state }) =>
  Boolean(state.textStyleId) &&
  !areEditHistoryValuesEqual(state.values, state.savedValues);

// Takes the values that were saved, since edits made while the save ran are
// still unsaved.
export const markValuesSaved = ({ state }, { values } = {}) => {
  state.savedValues = values;
};

export const setValues = ({ state }, { values } = {}) => {
  state.values = values;
};

// Remounts the form with the text style's values as they are now.
export const refreshForm = ({ state }) => {
  state.formRevision += 1;
};

// Records the values as they are now against the last recorded version.
// Repeated edits to the same values less than a second apart, such as
// changing one number a few times, are one step. An edit that changes
// nothing is not a step.
export const recordTextStyleEdit = ({ state }, { time } = {}) => {
  const before = state.editHistoryBaseline;
  // The baseline is set once the page has opened the text style.
  if (!before) {
    return;
  }
  const after = state.values;
  if (areEditHistoryValuesEqual(before, after)) {
    return;
  }
  recordEditHistoryStep(state.editHistory, {
    before: { values: before },
    after: { values: after },
    mergeKey: getEditHistoryChangeKey(before, after),
    time,
  });
  state.editHistoryBaseline = after;
};

export const selectEditHistoryStep = ({ state }, { direction } = {}) =>
  getEditHistoryStep(state.editHistory, direction);

// Undoes or redoes the latest step: puts its version of the values back,
// and the form shows it.
export const applyEditHistoryStep = ({ state }, { direction } = {}) => {
  const step = getEditHistoryStep(state.editHistory, direction);
  if (!step) {
    return;
  }
  const { values } = direction === "undo" ? step.before : step.after;
  moveEditHistoryStep(state.editHistory, direction);
  state.values = values;
  state.editHistoryBaseline = values;
  state.formRevision += 1;
};

export const selectPreviewText = ({ state }) => state.previewText;

const PREVIEW_ALIGN_VALUES = ["left", "center", "right"];

export const setPreviewAlign = ({ state }, { align } = {}) => {
  if (PREVIEW_ALIGN_VALUES.includes(align)) {
    state.previewAlign = align;
  }
};

export const selectHasUnsavedPreviewText = ({ state }) =>
  state.previewText !== state.savedPreviewText;

export const setPreviewText = ({ state }, { previewText } = {}) => {
  state.previewText = previewText;
};

export const markPreviewTextSaved = ({ state }, { previewText } = {}) => {
  state.savedPreviewText = previewText;
};

export const selectRightPanelMode = ({ state }) => state.rightPanelMode;

export const setRightPanelMode = ({ state }, { mode } = {}) => {
  if (RIGHT_PANEL_MODES.has(mode)) {
    state.rightPanelMode = mode;
  }
};

export const selectFontById = ({ state }, { fontId } = {}) =>
  getFontItem(state.fontsData, fontId);

export const selectFontCapabilities = ({ state }, { fontId } = {}) =>
  state.fontCapabilitiesById[fontId];

export const setFontCapabilities = (
  { state },
  { fontId, capabilities } = {},
) => {
  state.fontCapabilitiesById[fontId] = capabilities;
};

export const selectWarnedFontFileIds = ({ state }) => state.warnedFontFileIds;

// The preview leaves out a font file that failed to load, and draws the
// text in the next font, or the browser's.
export const markFontFilesFailed = ({ state }, { fileIds } = {}) => {
  state.failedFontFileIds = [
    ...new Set([...state.failedFontFileIds, ...fileIds]),
  ];
};

export const markFontWarningsShown = ({ state }, { fileIds } = {}) => {
  state.warnedFontFileIds = [
    ...new Set([...state.warnedFontFileIds, ...fileIds]),
  ];
};

export const selectIsSavingPreview = ({ state }) => state.isSavingPreview;

export const startSavingPreview = ({ state }) => {
  state.isSavingPreview = true;
};

export const finishSavingPreview = ({ state }) => {
  state.isSavingPreview = false;
};

export const selectAddColorDialogField = ({ state }) =>
  state.addColorDialog.field;

export const openAddColorDialog = ({ state }, { field } = {}) => {
  state.addColorDialog.open = true;
  state.addColorDialog.field = field;
};

export const closeAddColorDialog = ({ state }) => {
  state.addColorDialog = createAddColorDialog();
};

export const openAddFontDialog = ({ state }) => {
  state.addFontDialog.open = true;
};

export const closeAddFontDialog = ({ state }) => {
  state.addFontDialog = createAddFontDialog();
};

export const setSelectedFontFile = (
  { state },
  { fileName, uploadResult } = {},
) => {
  state.addFontDialog.fileName = fileName;
  state.addFontDialog.uploadResult = uploadResult;
};

export const selectSelectedFontFile = ({ state }) => ({
  fileName: state.addFontDialog.fileName,
  uploadResult: state.addFontDialog.uploadResult,
});

// The fonts the preview draws with, in order, without the files that failed
// to load.
const buildPreviewFontData = (state) => {
  const fontFamilies = [];
  const fileIds = [];
  const fontWeightDescriptors = [];
  for (const fontId of state.values.fontId) {
    const font = getFontItem(state.fontsData, fontId);
    fontFamilies.push(font?.fontFamily ?? fontId);
    if (font?.fileId && !state.failedFontFileIds.includes(font.fileId)) {
      fileIds.push(font.fileId);
      fontWeightDescriptors.push(getFontFaceWeightDescriptor(font) ?? "");
    }
  }
  return { fontFamilies, fileIds, fontWeightDescriptors };
};

const buildColorOptions = (colorsData) =>
  toFlatItems(colorsData)
    .filter((item) => item.type === "color")
    .map((color) => ({ label: color.name, value: color.id }));

const buildFontOptions = (fontsData) =>
  toFlatItems(fontsData)
    .filter((item) => item.type === "font")
    .map((font) => ({ label: font.fontFamily, value: font.id }));

// rtgl-form fills in only the fields that show when it mounts, so the key
// remounts it when the outline or shadow fields show or hide, and when the
// form needs the text style's values again.
const buildFormKey = (state) =>
  [
    "text-style-form",
    state.formRevision,
    Boolean(state.values.strokeColorId),
    Boolean(state.values.shadow),
  ].join("-");

export const selectViewData = ({ state, i18n }) => {
  const copy = selectTextStyleEditorPageCopy(i18n);
  const editHistoryCopy = selectEditHistoryCopy(i18n);
  const { values } = state;
  const showRightPanel = selectShowEditorRightPanelState({ state });
  const primaryFontId = toPrimaryFontId(values.fontId);
  const previewFontData = buildPreviewFontData(state);
  const colorOptions = buildColorOptions(state.colorsData);
  const addColorOption = { label: copy.addNewColorOption };

  return {
    resourceCategory: "userInterface",
    selectedResourceId: "text-style-editor",
    showExplorerPanel: !state.isTouchMode,
    showRightPanel,
    showMobilePanels: !showRightPanel,
    textStyleName: state.textStyleName,
    undoDisabled: state.editHistory.undo.length === 0,
    redoDisabled: state.editHistory.redo.length === 0,
    undoLabel: editHistoryCopy.undoLabel,
    redoLabel: editHistoryCopy.redoLabel,
    // The preview fills the workspace beside the right panel, and the top
    // of it above the panel otherwise.
    previewAreaStyle: showRightPanel
      ? "flex: 1 1 auto; min-height: 0;"
      : "flex: 0 0 auto; height: 40cqh;",
    // The preview box is half the area's height inside its 16px padding,
    // centered in it: the workspace's container units, since the area's
    // flexed height does not resolve percentages.
    previewFrameStyle: showRightPanel
      ? "height: calc(50cqh - 16px);"
      : "height: calc(20cqh - 16px);",
    // An empty preview text shows the name, as the text styles page does.
    previewText: state.previewText.trim()
      ? state.previewText
      : state.textStyleName,
    previewFontFamilies: previewFontData.fontFamilies,
    previewFontFileIds: previewFontData.fileIds,
    previewFontWeightDescriptors: previewFontData.fontWeightDescriptors,
    previewFontSize: values.fontSize,
    previewLineHeight: values.lineHeight,
    previewFontWeight: values.fontWeight,
    previewColor: getColorHex(state.colorsData, values.colorId),
    previewStrokeColor: values.strokeColorId
      ? getColorHex(state.colorsData, values.strokeColorId)
      : undefined,
    previewStrokeWidth: values.strokeColorId ? values.strokeWidth : 0,
    previewShadowColor: values.shadow
      ? getColorHex(state.colorsData, values.shadow.colorId)
      : undefined,
    previewShadowAlpha: values.shadow?.alpha ?? 1,
    previewShadowBlur: values.shadow?.blur ?? 0,
    previewShadowOffsetX: values.shadow?.offsetX ?? 2,
    previewShadowOffsetY: values.shadow?.offsetY ?? 2,
    rightPanelMode: state.rightPanelMode,
    rightPanelModeTabs: [
      { id: "edit", label: copy.editModeLabel },
      { id: "preview", label: copy.previewTitle },
    ],
    // Both bodies stay mounted, so scroll positions survive a switch.
    rightPanelEditStyle:
      state.rightPanelMode === "edit" ? "" : "display: none;",
    rightPanelPreviewStyle:
      state.rightPanelMode === "preview" ? "" : "display: none;",
    showSavePreviewButton: state.rightPanelMode === "preview",
    savePreviewDisabled: state.isSavingPreview,
    savePreviewButton: copy.savePreviewButton,
    textStyleForm: createTextStyleForm({
      copy,
      fontWeightOptions: buildFontWeightOptions({
        capabilities: state.fontCapabilitiesById[primaryFontId],
        grandfatheredWeight:
          state.openedFont.fontId === primaryFontId
            ? state.openedFont.fontWeight
            : undefined,
        copy,
      }),
      showOutlineWidth: Boolean(values.strokeColorId),
      showShadowFields: Boolean(values.shadow),
    }),
    textStyleFormKey: buildFormKey(state),
    formValues: buildTextStyleFormValues(values),
    fontOptions: buildFontOptions(state.fontsData),
    selectedFontId: primaryFontId,
    addFontOption: { label: copy.addNewFontOption },
    chooseFontPlaceholder: copy.chooseFontPlaceholder,
    colorOptions,
    addColorOption,
    selectedColorId: values.colorId,
    selectedOutlineColorId: values.strokeColorId,
    selectedShadowColorId: values.shadow?.colorId,
    chooseColorPlaceholder: copy.chooseColorPlaceholder,
    chooseOutlineColorPlaceholder: copy.chooseOutlineColorPlaceholder,
    chooseShadowColorPlaceholder: copy.chooseShadowColorPlaceholder,
    previewTextLabel: copy.previewTextLabel,
    previewTextDescription: copy.previewTextDescription,
    previewTextInputValue: state.previewText,
    previewAlign: state.previewAlign,
    previewAlignmentLabel: copy.previewAlignmentLabel,
    previewAlignmentDescription: copy.previewAlignmentDescription,
    previewAlignOptions: [
      { value: "left", label: copy.alignLeftOption },
      { value: "center", label: copy.alignCenterOption },
      { value: "right", label: copy.alignRightOption },
    ],
    isAddColorDialogOpen: state.addColorDialog.open,
    addColorForm: createAddColorForm({
      folderOptions: createFolderOptions(state.colorsData, copy),
      copy,
    }),
    addColorDefaultValues: createAddColorDefaultValues(),
    addColorSubmitButtonLabel: copy.addColorButton,
    isAddFontDialogOpen: state.addFontDialog.open,
    addFontForm: createAddFontForm({
      folderOptions: createFolderOptions(state.fontsData, copy),
      copy,
    }),
    addFontDefaultValues: createAddFontDefaultValues(),
    addFontSubmitButtonLabel: copy.addFontButton,
    hasSelectedFont: Boolean(state.addFontDialog.uploadResult),
    selectedFontFileName: state.addFontDialog.fileName,
    fontSelectedLabel: copy.fontSelectedLabel,
    dragDropText: state.addFontDialog.uploadResult
      ? copy.dragDropReplace
      : copy.dragDropClick,
    fontFileTypes: NEW_FONT_FILE_TYPES,
  };
};
