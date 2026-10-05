import { produce } from "immer";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as textStyleEditorStore from "../../src/pages/textStyleEditor/textStyleEditor.store.js";
import {
  handleAddColorDialogClose,
  handleAddColorSubmitClick,
  handleAddFontSubmitClick,
  handleAfterMount,
  handleBackClick,
  handleBeforeMount,
  handleColorSelectAddOptionClick,
  handleColorSelectChange,
  handleFontFileRejected,
  handleFontFileSelected,
  handleFontSelectAddOptionClick,
  handleFontSelectChange,
  handlePreviewFontLoadError,
  handlePreviewAlignChange,
  handlePreviewTextInput,
  handleRedoButtonClick,
  handleRightPanelModeChange,
  handleSavePreviewClick,
  handleTextStyleFormChange,
  handleUndoButtonClick,
} from "../../src/pages/textStyleEditor/textStyleEditor.handlers.js";
import { createTestFontBytes } from "../support/fontFixtures.js";
import { EN_I18N } from "../support/i18n.js";

// Edits save on their own 300ms after the last one.

// The form's fields by name or slot, with each section and its fields.
const formFieldNames = (fields) =>
  fields.flatMap((field) =>
    field.type === "section"
      ? [`section:${field.id}`, ...formFieldNames(field.fields)]
      : [field.name ?? field.slot],
  );
const AUTOSAVE_WAIT_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A text style with an outline, a fallback font, and fields the editor does
// not show (its alignment and wrapping).
const createSavedTextStyle = () => ({
  id: "text-style-1",
  type: "textStyle",
  name: "Text Style One",
  description: "Dialogue text.",
  tagIds: ["tag-1"],
  fontId: ["font-1", "font-2"],
  colorId: "color-1",
  fontSize: 24,
  lineHeight: 1.5,
  fontWeight: "400",
  strokeColorId: "color-2",
  strokeWidth: 3,
  previewText: "Preview One",
  align: "center",
  wordWrap: true,
  wordWrapWidth: 600,
});

const createFont = (id, { fileId, ...fields } = {}) => ({
  id,
  type: "font",
  name: `${id}.ttf`,
  fontFamily: `Family ${id}`,
  fileId: fileId ?? `file-${id}`,
  fileType: "font/ttf",
  ...fields,
});

const createRepositoryState = (item) => ({
  textStyles: {
    tree: [{ id: item.id }],
    items: { [item.id]: item },
  },
  colors: {
    tree: [{ id: "color-1" }, { id: "color-2" }, { id: "color-3" }],
    items: {
      "color-1": {
        id: "color-1",
        type: "color",
        name: "White",
        hex: "#ffffff",
      },
      "color-2": {
        id: "color-2",
        type: "color",
        name: "Black",
        hex: "#000000",
      },
      "color-3": { id: "color-3", type: "color", name: "Red", hex: "#ff0000" },
    },
  },
  fonts: {
    tree: [{ id: "font-1" }, { id: "font-2" }, { id: "font-bold" }],
    items: {
      "font-1": createFont("font-1"),
      "font-2": createFont("font-2"),
      // A static bold font whose weights are saved with it.
      "font-bold": createFont("font-bold", {
        minWeight: 700,
        defaultWeight: 700,
        maxWeight: 700,
      }),
    },
  },
  files: { tree: [], items: {} },
});

// The page on its real store, opened on a saved text style.
const createPage = async ({
  item = createSavedTextStyle(),
  uiConfig = {},
} = {}) => {
  let state = textStyleEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return textStyleEditorStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = textStyleEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const subject = new Subject();
  subject.dispatch = (action, payload) => subject.next({ action, payload });
  const windowListeners = {};
  const windowMetricsListeners = new Set();
  let beforeNavigation;
  const repositoryState = createRepositoryState(item);
  const formValues = { addColorForm: {}, addFontForm: {} };
  const deps = {
    store,
    subject,
    render: vi.fn(),
    i18n: EN_I18N,
    uiConfig,
    windowMetricsClient: {
      subscribe: (listener) => {
        windowMetricsListeners.add(listener);
        return () => windowMetricsListeners.delete(listener);
      },
    },
    refs: {
      addColorForm: { getValues: () => formValues.addColorForm },
      addFontForm: { getValues: () => formValues.addFontForm },
    },
    browserEventsClient: {
      subscribeWindowEvent: ({ type, listener }) => {
        windowListeners[type] = listener;
        return () => delete windowListeners[type];
      },
    },
    appService: {
      getPayload: () => ({ p: "project-1", ts: item.id }),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      reportError: vi.fn(),
      registerBeforeNavigation: (handler) => {
        beforeNavigation = handler;
        return () => {};
      },
    },
    projectService: {
      ensureRepository: async () => {},
      getRepositoryState: () => repositoryState,
      getFileContent: vi.fn(async (fileId) => ({
        url: `blob:${fileId}`,
        revoke: vi.fn(),
      })),
      updateTextStyle: vi.fn(async () => ({ valid: true })),
      // The store freezes what it keeps, so new resources replace the
      // collections, as the repository does.
      createColor: vi.fn(async ({ colorId, data }) => {
        const { colors } = repositoryState;
        repositoryState.colors = {
          tree: [...colors.tree, { id: colorId }],
          items: { ...colors.items, [colorId]: { id: colorId, ...data } },
        };
        return { valid: true };
      }),
      uploadFiles: vi.fn(async ([file]) => [
        {
          fileId: "file-new",
          displayName: file.name,
          fileRecords: [{ id: "record-new" }],
        },
      ]),
      createFont: vi.fn(async ({ fontId, data }) => {
        const { fonts } = repositoryState;
        repositoryState.fonts = {
          tree: [...fonts.tree, { id: fontId }],
          items: { ...fonts.items, [fontId]: { id: fontId, ...data } },
        };
        return { valid: true };
      }),
    },
  };
  const cleanup = handleBeforeMount(deps);
  await handleAfterMount(deps);

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const press = (key, options = {}) => {
    const event = {
      key,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      composedPath: () => [],
      ...options,
    };
    windowListeners.keydown(event);
    return event;
  };
  const changeField = (name, value) =>
    handleTextStyleFormChange(deps, {
      _event: { detail: { name, value, values: { [name]: value } } },
    });
  const pickColor = (field, value) =>
    handleColorSelectChange(deps, {
      _event: {
        detail: { value },
        currentTarget: { dataset: { colorField: field } },
      },
    });
  const pickFont = (value) =>
    handleFontSelectChange(deps, { _event: { detail: { value } } });
  return {
    deps,
    cleanup,
    repositoryState,
    formValues,
    state: () => state,
    values: () => state.values,
    view: () => textStyleEditorStore.selectViewData({ state, i18n: EN_I18N }),
    press,
    flush,
    changeField,
    pickColor,
    pickFont,
    beforeNavigation: () => beforeNavigation(),
    resizeWindow: async (metrics) => {
      windowMetricsListeners.forEach((listener) => listener(metrics));
      await flush();
    },
    savedData: () =>
      deps.projectService.updateTextStyle.mock.calls.map(([call]) => call),
  };
};

// Font files are regular 400-weight fonts unless a test says otherwise.
const stubFontFiles = (weight) => {
  const fontBytes = createTestFontBytes({ weight });
  const fetch = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => fontBytes.buffer,
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

beforeEach(() => {
  stubFontFiles(400);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("text style editor", () => {
  it("opens the text style in a large live preview with its values in the form", async () => {
    const page = await createPage();

    expect(page.view()).toMatchObject({
      textStyleName: "Text Style One",
      undoDisabled: true,
      redoDisabled: true,
      selectedResourceId: "text-style-editor",
      previewText: "Preview One",
      previewFontFamilies: ["Family font-1", "Family font-2"],
      previewFontFileIds: ["file-font-1", "file-font-2"],
      previewFontSize: 24,
      previewColor: "#ffffff",
      previewStrokeColor: "#000000",
      previewStrokeWidth: 3,
      previewShadowColor: undefined,
      selectedFontId: "font-1",
      selectedColorId: "color-1",
      selectedOutlineColorId: "color-2",
      selectedShadowColorId: undefined,
      rightPanelMode: "edit",
      showRightPanel: true,
      showMobilePanels: false,
    });
    expect(page.view().formValues).toMatchObject({
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "400",
      strokeWidth: 3,
    });
    // Outline and shadow have their own sections. The outline thickness
    // shows with the outline color; the shadow fields show only with a
    // shadow color.
    const fieldNames = formFieldNames(page.view().textStyleForm.fields);
    expect(fieldNames).toEqual([
      "text-style-font",
      "fontSize",
      "lineHeight",
      "fontWeight",
      "text-style-color",
      "section:outline",
      "text-style-outline-color",
      "strokeWidth",
      "section:shadow",
      "text-style-shadow-color",
    ]);
    expect(
      page
        .view()
        .textStyleForm.fields.filter((field) => field.type === "section")
        .map((field) => field.label),
    ).toEqual(["Outline", "Shadow"]);
    // Name, description and tags are edited on the text styles page.
    expect(fieldNames).not.toContain("name");
    expect(fieldNames).not.toContain("tagIds");
  });

  it("alerts and goes back when the text style is missing", async () => {
    const page = await createPage({
      item: { ...createSavedTextStyle(), type: "folder" },
    });

    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Text style not found.",
    });
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/text-styles",
      { p: "project-1" },
      { historyMode: "replace" },
    );
  });

  it("applies the field that changed, and saves only how the text looks", async () => {
    const page = await createPage();

    await page.changeField("fontSize", 32);

    expect(page.values()).toMatchObject({
      fontSize: 32,
      lineHeight: 1.5,
      fontId: ["font-1", "font-2"],
      strokeColorId: "color-2",
      strokeWidth: 3,
    });
    expect(page.state().editHistory.undo).toHaveLength(1);
    expect(page.savedData()).toEqual([]);

    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([
      {
        textStyleId: "text-style-1",
        data: {
          fontId: ["font-1", "font-2"],
          colorId: "color-1",
          fontSize: 32,
          lineHeight: 1.5,
          fontWeight: "400",
          strokeColorId: "color-2",
          strokeWidth: 3,
          clearShadow: true,
        },
      },
    ]);
  });

  it("keeps a value the field cannot keep, and shows it again in the form", async () => {
    const page = await createPage();
    const formKey = page.view().textStyleFormKey;

    await page.changeField("fontSize", "");

    expect(page.values().fontSize).toBe(24);
    expect(page.view().textStyleFormKey).not.toBe(formKey);
    expect(page.state().editHistory.undo).toHaveLength(0);

    await page.changeField("shadowAlpha", 2);
    // No shadow, so its opacity has nothing to change.
    expect(page.values().shadow).toBeUndefined();
  });

  it("makes one undo step of quick changes to one field, and puts the values back into the form", async () => {
    const page = await createPage();

    await page.changeField("fontSize", 30);
    await page.changeField("fontSize", 32);
    expect(page.state().editHistory.undo).toHaveLength(1);

    await page.changeField("lineHeight", 2);
    expect(page.state().editHistory.undo).toHaveLength(2);
    const formKey = page.view().textStyleFormKey;

    handleUndoButtonClick(page.deps);
    expect(page.values().lineHeight).toBe(1.5);
    expect(page.view().formValues.lineHeight).toBe(1.5);
    expect(page.view().textStyleFormKey).not.toBe(formKey);
    handleUndoButtonClick(page.deps);
    expect(page.values().fontSize).toBe(24);
    expect(page.view().undoDisabled).toBe(true);

    handleRedoButtonClick(page.deps);
    expect(page.values().fontSize).toBe(32);
    expect(page.view().redoDisabled).toBe(false);
  });

  it("undoes and redoes with the shortcuts, but not in a text field or a dialog", async () => {
    const page = await createPage();
    await page.changeField("fontSize", 32);

    const textFieldEvent = page.press("z", {
      metaKey: true,
      composedPath: () => [{ tagName: "INPUT", type: "text" }],
    });
    expect(textFieldEvent.preventDefault).not.toHaveBeenCalled();
    page.press("z", {
      ctrlKey: true,
      composedPath: () => [{ tagName: "DIALOG" }],
    });
    expect(page.values().fontSize).toBe(32);

    const undoEvent = page.press("z", { metaKey: true });
    expect(undoEvent.preventDefault).toHaveBeenCalled();
    expect(page.values().fontSize).toBe(24);

    page.press("z", { metaKey: true, shiftKey: true });
    expect(page.values().fontSize).toBe(32);
  });

  it("saves waiting edits at once when it leaves", async () => {
    const page = await createPage();
    await page.changeField("fontSize", 32);

    await handleBackClick(page.deps);

    expect(page.savedData().map(({ data }) => data.fontSize)).toEqual([32]);
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/text-styles",
      { p: "project-1" },
      { historyMode: "replace" },
    );

    await page.beforeNavigation();
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toHaveLength(1);
  });

  it("saves nothing when an edit is undone before it saves", async () => {
    const page = await createPage();
    await page.changeField("fontSize", 32);
    page.press("z", { metaKey: true });

    await handleBackClick(page.deps);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([]);
  });

  it("keeps the page open when the save fails", async () => {
    const page = await createPage();
    page.deps.projectService.updateTextStyle.mockResolvedValue({
      valid: false,
    });
    await page.changeField("fontSize", 32);

    await handleBackClick(page.deps);

    expect(page.deps.appService.navigate).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to save text style." }),
    );
    await expect(page.beforeNavigation()).rejects.toThrow(
      "Failed to save text style before navigation.",
    );
  });

  it("saves waiting edits when the page is cleaned up, and fails the cleanup when that save fails", async () => {
    const page = await createPage();
    await page.changeField("fontSize", 32);

    // The preview has its own renderer, so the save does not wait for a
    // shared one to be released.
    await page.cleanup();
    expect(page.savedData().map(({ data }) => data.fontSize)).toEqual([32]);

    const failing = await createPage();
    failing.deps.projectService.updateTextStyle.mockResolvedValue({
      valid: false,
    });
    await failing.changeField("fontSize", 32);
    await expect(failing.cleanup()).rejects.toThrow(
      "Failed to save text style during cleanup.",
    );
  });

  it("adds an outline with a visible thickness, and clears it", async () => {
    const page = await createPage({
      item: {
        ...createSavedTextStyle(),
        strokeColorId: undefined,
        strokeWidth: undefined,
      },
    });
    const formKey = page.view().textStyleFormKey;
    expect(formFieldNames(page.view().textStyleForm.fields)).not.toContain(
      "strokeWidth",
    );

    page.pickColor("strokeColorId", "color-3");

    expect(page.values()).toMatchObject({
      strokeColorId: "color-3",
      strokeWidth: 2,
    });
    expect(page.view().previewStrokeColor).toBe("#ff0000");
    // The thickness field shows, so the form remounts.
    expect(page.view().textStyleFormKey).not.toBe(formKey);
    expect(formFieldNames(page.view().textStyleForm.fields)).toContain(
      "strokeWidth",
    );

    page.pickColor("strokeColorId", undefined);
    expect(page.values()).toMatchObject({
      strokeColorId: undefined,
      strokeWidth: 0,
    });
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toEqual([]);
  });

  it("adds a shadow with default settings and saves it, then clears it", async () => {
    const page = await createPage();

    page.pickColor("shadowColorId", "color-2");
    expect(page.values().shadow).toEqual({
      colorId: "color-2",
      alpha: 1,
      blur: 0,
      offsetX: 2,
      offsetY: 2,
    });
    await page.changeField("shadowBlur", 6);
    expect(page.values().shadow.blur).toBe(6);
    expect(page.view()).toMatchObject({
      previewShadowColor: "#000000",
      previewShadowBlur: 6,
    });
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()[0].data).toMatchObject({
      shadow: { colorId: "color-2", blur: 6 },
    });
    expect(page.savedData()[0].data).not.toHaveProperty("clearShadow");

    page.pickColor("shadowColorId", undefined);
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()[1].data).toMatchObject({ clearShadow: true });
    expect(page.savedData()[1].data).not.toHaveProperty("shadow");
  });

  it("keeps the fallback fonts for the same font and replaces them for another", async () => {
    const page = await createPage();

    await page.pickFont("font-1");
    expect(page.values().fontId).toEqual(["font-1", "font-2"]);
    expect(page.state().editHistory.undo).toHaveLength(0);

    await page.pickFont("font-2");
    expect(page.values().fontId).toEqual(["font-2"]);
    expect(page.view().previewFontFileIds).toEqual(["file-font-2"]);
    expect(page.state().editHistory.undo).toHaveLength(1);
  });

  it("moves the weight to one the new font can draw, in the same undo step", async () => {
    const page = await createPage();

    await page.pickFont("font-bold");

    expect(page.values()).toMatchObject({
      fontId: ["font-bold"],
      fontWeight: "700",
    });
    expect(
      page
        .view()
        .textStyleForm.fields.find((field) => field.name === "fontWeight")
        .options.map((option) => option.value),
    ).toEqual(["700"]);
    expect(page.state().editHistory.undo).toHaveLength(1);

    handleUndoButtonClick(page.deps);
    expect(page.values()).toMatchObject({
      fontId: ["font-1", "font-2"],
      fontWeight: "400",
    });
  });

  it("keeps a weight the text style already had with its font", async () => {
    const page = await createPage({
      item: {
        ...createSavedTextStyle(),
        fontId: ["font-bold"],
        fontWeight: "400",
      },
    });

    expect(
      page
        .view()
        .textStyleForm.fields.find((field) => field.name === "fontWeight")
        .options.map((option) => option.value),
    ).toEqual(["400", "700"]);

    await page.pickFont("font-1");
    await page.pickFont("font-bold");
    expect(page.values().fontWeight).toBe("400");
  });

  it("reads a font's weights from its file once", async () => {
    const fetch = stubFontFiles(600);
    const page = await createPage();

    expect(
      page
        .view()
        .textStyleForm.fields.find((field) => field.name === "fontWeight")
        .options.map((option) => option.value),
    ).toEqual(["400", "600"]);

    await page.pickFont("font-2");
    expect(page.values().fontWeight).toBe("600");
    await page.pickFont("font-1");
    // Font One's weights were read when the page opened.
    expect(page.values().fontWeight).toBe("600");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("adds a color from a color select, and picks it there as one undo step", async () => {
    const page = await createPage();
    await page.changeField("fontSize", 32);

    handleColorSelectAddOptionClick(page.deps, {
      _event: { currentTarget: { dataset: { colorField: "strokeColorId" } } },
    });
    expect(page.view().isAddColorDialogOpen).toBe(true);
    page.formValues.addColorForm = {
      name: " Color Four ",
      description: "",
      hex: "#00ff00",
      folderId: "_root",
    };

    await handleAddColorSubmitClick(page.deps);

    const [{ colorId, data, parentId }] =
      page.deps.projectService.createColor.mock.calls[0];
    expect(data).toEqual({
      type: "color",
      name: "Color Four",
      description: "",
      hex: "#00ff00",
    });
    expect(parentId).toBe("_root");
    expect(page.values().strokeColorId).toBe(colorId);
    expect(page.view()).toMatchObject({
      isAddColorDialogOpen: false,
      previewStrokeColor: "#00ff00",
    });
    expect(page.view().colorOptions.at(-1)).toEqual({
      label: "Color Four",
      value: colorId,
    });
    expect(page.state().editHistory.undo).toHaveLength(2);

    handleUndoButtonClick(page.deps);
    expect(page.values().strokeColorId).toBe("color-2");
  });

  it("asks for a color name, and closing the dialog changes nothing", async () => {
    const page = await createPage();
    handleColorSelectAddOptionClick(page.deps, {
      _event: { currentTarget: { dataset: { colorField: "colorId" } } },
    });
    page.formValues.addColorForm = { name: " ", hex: "#00ff00" };

    await handleAddColorSubmitClick(page.deps);

    expect(page.deps.projectService.createColor).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Color name is required.",
      title: "Warning",
    });

    handleAddColorDialogClose(page.deps);
    expect(page.view().isAddColorDialogOpen).toBe(false);
    expect(page.state().editHistory.undo).toHaveLength(0);
  });

  it("adds a font from the font select, and picks it with its own weight as one undo step", async () => {
    const page = await createPage();
    handleFontSelectAddOptionClick(page.deps);
    expect(page.view().isAddFontDialogOpen).toBe(true);

    const fontBytes = createTestFontBytes({ weight: 700 });
    await handleFontFileSelected(page.deps, {
      _event: {
        detail: {
          files: [new File([fontBytes], "Font Four.ttf", { type: "font/ttf" })],
        },
      },
    });
    expect(page.view()).toMatchObject({
      hasSelectedFont: true,
      selectedFontFileName: "Font Four",
    });
    page.formValues.addFontForm = { description: "", folderId: "_root" };

    await handleAddFontSubmitClick(page.deps);

    const [{ fontId, data, fileRecords }] =
      page.deps.projectService.createFont.mock.calls[0];
    expect(data).toMatchObject({
      type: "font",
      fileId: "file-new",
      name: "Font Four",
      fontFamily: "Font Four",
    });
    expect(fileRecords).toEqual([{ id: "record-new" }]);
    expect(page.values()).toMatchObject({
      fontId: [fontId],
      fontWeight: "700",
    });
    expect(page.view()).toMatchObject({
      isAddFontDialogOpen: false,
      hasSelectedFont: false,
      selectedFontId: fontId,
    });
    expect(page.view().fontOptions.at(-1)).toEqual({
      label: "Font Four",
      value: fontId,
    });
    expect(page.state().editHistory.undo).toHaveLength(1);
  });

  it("asks for a font file, and rejects WOFF1 files", async () => {
    const page = await createPage();
    handleFontSelectAddOptionClick(page.deps);

    await handleAddFontSubmitClick(page.deps);
    expect(page.deps.appService.showAlert).toHaveBeenLastCalledWith({
      message: "Please select a font file",
      title: "Warning",
    });

    const legacyFont = new File(["legacy woff"], "legacy.woff", {
      type: "font/woff",
    });
    await handleFontFileSelected(page.deps, {
      _event: { detail: { files: [legacyFont] } },
    });
    handleFontFileRejected(page.deps, {
      _event: { detail: { files: [legacyFont] } },
    });

    expect(page.deps.projectService.uploadFiles).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlert).toHaveBeenLastCalledWith({
      message:
        "Invalid file format. Please upload a TTF, OTF, or WOFF2 font file.",
      title: "Warning",
    });
    expect(page.deps.projectService.createFont).not.toHaveBeenCalled();
  });

  it("aligns the preview text left, center or right for this visit only", async () => {
    const page = await createPage();
    expect(page.view().previewAlign).toBe("center");
    expect(page.view().previewAlignOptions).toEqual([
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
    ]);

    handlePreviewAlignChange(page.deps, {
      _event: { detail: { value: "right" } },
    });
    expect(page.view().previewAlign).toBe("right");
    handlePreviewAlignChange(page.deps, {
      _event: { detail: { value: "justify" } },
    });
    expect(page.view().previewAlign).toBe("right");

    // It is only how the editor shows the preview: no edit, nothing saves.
    expect(page.state().editHistory.undo).toHaveLength(0);
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toEqual([]);
  });
  it("previews the preview text without saving it, and Save Preview saves it after the values", async () => {
    const page = await createPage();
    await page.changeField("fontSize", 32);
    handleRightPanelModeChange(page.deps, {
      _event: { detail: { id: "preview" } },
    });
    expect(page.view()).toMatchObject({
      rightPanelEditStyle: "display: none;",
      rightPanelPreviewStyle: "",
      showSavePreviewButton: true,
    });

    handlePreviewTextInput(page.deps, {
      _event: { detail: { value: "A longer preview line" } },
    });
    expect(page.view().previewText).toBe("A longer preview line");
    expect(page.state().editHistory.undo).toHaveLength(1);

    await handleSavePreviewClick(page.deps);

    expect(page.savedData()).toEqual([
      {
        textStyleId: "text-style-1",
        data: expect.objectContaining({ fontSize: 32 }),
      },
      {
        textStyleId: "text-style-1",
        data: { previewText: "A longer preview line" },
      },
    ]);
    expect(page.deps.appService.showToast).toHaveBeenCalledWith({
      message: "Text style preview saved.",
    });

    // Saved already, so a second Save Preview writes nothing.
    await handleSavePreviewClick(page.deps);
    expect(page.savedData()).toHaveLength(2);
    expect(page.deps.appService.showToast).toHaveBeenCalledTimes(2);
  });

  it("shows the name for an empty preview text, and leaves unsaved preview text behind", async () => {
    const page = await createPage();

    handlePreviewTextInput(page.deps, { _event: { detail: { value: " " } } });
    expect(page.view().previewText).toBe("Text Style One");

    await handleBackClick(page.deps);
    expect(page.savedData()).toEqual([]);
  });

  it("saves the preview text once when Save Preview is clicked twice", async () => {
    let finishSave;
    const page = await createPage();
    page.deps.projectService.updateTextStyle.mockReturnValue(
      new Promise((resolve) => {
        finishSave = () => resolve({ valid: true });
      }),
    );
    handlePreviewTextInput(page.deps, {
      _event: { detail: { value: "Preview Two" } },
    });

    const firstClick = handleSavePreviewClick(page.deps);
    const secondClick = handleSavePreviewClick(page.deps);
    expect(page.view().savePreviewDisabled).toBe(true);
    await page.flush();
    finishSave();
    await Promise.all([firstClick, secondClick]);

    expect(page.savedData()).toHaveLength(1);
    expect(page.view().savePreviewDisabled).toBe(false);
  });

  it("alerts when the preview text cannot be saved", async () => {
    const page = await createPage();
    page.deps.projectService.updateTextStyle.mockResolvedValue({
      valid: false,
    });
    handlePreviewTextInput(page.deps, {
      _event: { detail: { value: "Preview Two" } },
    });

    await handleSavePreviewClick(page.deps);

    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to save the text style preview.",
      title: "Error",
    });
    expect(page.deps.appService.showToast).not.toHaveBeenCalled();
    expect(page.view().savePreviewDisabled).toBe(false);
  });

  it("draws without a font file that fails to load, warns about it once, and keeps editing", async () => {
    const page = await createPage();
    const failFontOne = () =>
      handlePreviewFontLoadError(page.deps, {
        _event: {
          detail: {
            failures: [
              { fileId: "file-font-1", error: new Error("Font missing.") },
            ],
          },
        },
      });

    failFontOne();

    expect(page.view()).toMatchObject({
      previewFontFamilies: ["Family font-1", "Family font-2"],
      previewFontFileIds: ["file-font-2"],
    });
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Warning",
      message: expect.stringContaining("Fonts: font-1.ttf"),
    });

    failFontOne();
    await page.changeField("fontSize", 32);
    expect(page.values().fontSize).toBe(32);
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    // The saved fonts stay as they are.
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()[0].data.fontId).toEqual(["font-1", "font-2"]);
  });

  it("shows the panel under the preview on a phone", async () => {
    const page = await createPage({ uiConfig: { id: "touch" } });
    await page.resizeWindow({ width: 390, height: 844 });

    expect(page.view()).toMatchObject({
      showExplorerPanel: false,
      showRightPanel: false,
      showMobilePanels: true,
      previewAreaStyle: "flex: 0 0 auto; height: 40cqh;",
      previewFrameStyle: "height: calc(20cqh - 16px);",
    });
  });

  it("keeps the panel on the right in tablet landscape, and moves it under the preview in portrait", async () => {
    const page = await createPage({ uiConfig: { id: "touch" } });
    await page.resizeWindow({ width: 1133, height: 744 });

    expect(page.view()).toMatchObject({
      showExplorerPanel: false,
      showRightPanel: true,
      showMobilePanels: false,
      previewAreaStyle: "flex: 1 1 auto; min-height: 0;",
      previewFrameStyle: "height: calc(50cqh - 16px);",
    });

    await page.resizeWindow({ width: 744, height: 1133 });

    expect(page.view()).toMatchObject({
      showRightPanel: false,
      showMobilePanels: true,
    });
  });
});
