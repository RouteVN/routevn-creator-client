import { describe, expect, it, vi } from "vitest";
import {
  handleDesktopTextStyleFormKeyDown,
  handleDesktopTextStyleSubmitClick,
  handleDialogFormChange,
  handleFormActionClick,
  handleItemDuplicate,
  handleMobileDetailEditClick,
} from "../../src/pages/textStyles/textStyles.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import { createTestFontBytes } from "../support/fontFixtures.js";

describe("textStyles.handlers", () => {
  const createProjectState = () => ({
    textStyles: {
      items: {},
      tree: [],
    },
    colors: {
      items: {},
      tree: [],
    },
    fonts: {
      items: {},
      tree: [],
    },
  });

  const createFormDeps = ({
    createTextStyle = vi.fn(async () => "text-style-new"),
    updateTextStyle = vi.fn(async () => ({ valid: true })),
    dialogState = {
      targetGroupId: undefined,
      editMode: false,
      editingItemId: undefined,
    },
  } = {}) => ({
    i18n: EN_I18N,
    store: {
      getState: () => ({
        currentFormValues: {
          previewText: "Preview",
        },
      }),
      selectDialogState: vi.fn(() => dialogState),
      selectFontCapabilities: vi.fn(() => ({ kind: "unrestricted" })),
      selectFontById: vi.fn(),
      selectItemById: vi.fn(),
      selectIsTouchMode: vi.fn(() => false),
      selectCurrentPreviewText: vi.fn(() => "Preview"),
      resetFormValues: vi.fn(),
      clearEditMode: vi.fn(),
      toggleDialog: vi.fn(),
      setItems: vi.fn(),
      setTagsData: vi.fn(),
      setColorsData: vi.fn(),
      setFontsData: vi.fn(),
      setFontCapabilities: vi.fn(),
      openAddColorDialog: vi.fn(),
      openAddFontDialog: vi.fn(),
    },
    projectService: {
      createTextStyle,
      updateTextStyle,
      getState: createProjectState,
    },
    appService: {
      showAlert: vi.fn(),
    },
    refs: {
      textStyleForm: {
        getValues: vi.fn(() => createSubmitPayload()._event.detail.values),
      },
    },
    render: vi.fn(),
  });

  const createSubmitPayload = (values = {}) => ({
    _event: {
      detail: {
        actionId: "submit",
        values: {
          name: "Dialogue",
          description: "",
          tagIds: [],
          fontSize: 24,
          lineHeight: 1.5,
          fontColor: "color-1",
          fontId: "font-1",
          fontWeight: "400",
          strokeColor: "",
          strokeWidth: 0,
          shadowColor: "",
          shadowAlpha: 1,
          shadowBlur: 0,
          shadowOffsetX: 2,
          shadowOffsetY: 2,
          ...values,
        },
      },
    },
  });

  it("omits empty tag ids when creating a text style", async () => {
    const createTextStyle = vi.fn(async () => "text-style-new");
    const deps = createFormDeps({ createTextStyle });

    await handleFormActionClick(deps, createSubmitPayload());

    const createPayload = createTextStyle.mock.calls[0][0];
    expect(Object.hasOwn(createPayload.data, "tagIds")).toBe(false);
  });

  it("keeps empty tag ids when updating a text style", async () => {
    const updateTextStyle = vi.fn(async () => ({ valid: true }));
    const deps = createFormDeps({
      updateTextStyle,
      dialogState: {
        targetGroupId: undefined,
        editMode: true,
        editingItemId: "text-style-1",
      },
    });

    await handleFormActionClick(deps, createSubmitPayload());

    expect(updateTextStyle).toHaveBeenCalledWith(
      expect.objectContaining({
        textStyleId: "text-style-1",
        data: expect.objectContaining({
          tagIds: [],
          clearShadow: true,
        }),
      }),
    );
  });

  it("persists shadow settings", async () => {
    const createTextStyle = vi.fn(async () => "text-style-new");
    const deps = createFormDeps({ createTextStyle });

    await handleFormActionClick(
      deps,
      createSubmitPayload({
        shadowColor: "color-shadow",
        shadowAlpha: 0.75,
        shadowBlur: 6,
        shadowOffsetX: -2,
        shadowOffsetY: 3,
      }),
    );

    expect(createTextStyle.mock.calls[0][0].data).toMatchObject({
      fontId: "font-1",
      shadow: {
        colorId: "color-shadow",
        alpha: 0.75,
        blur: 6,
        offsetX: -2,
        offsetY: 3,
      },
    });
  });

  it("rejects a new text style weight unsupported by a static font", async () => {
    const createTextStyle = vi.fn(async () => "text-style-new");
    const deps = createFormDeps({ createTextStyle });
    deps.store.selectFontCapabilities.mockReturnValue({
      kind: "static",
      defaultWeight: 400,
      minWeight: 400,
      maxWeight: 400,
    });

    await handleFormActionClick(
      deps,
      createSubmitPayload({ fontWeight: "700" }),
    );

    expect(createTextStyle).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("not supported"),
      }),
    );
  });

  it("preserves an existing unsupported weight while editing", async () => {
    const updateTextStyle = vi.fn(async () => ({ valid: true }));
    const deps = createFormDeps({
      updateTextStyle,
      dialogState: {
        targetGroupId: undefined,
        editMode: true,
        editingItemId: "text-style-1",
      },
    });
    deps.store.selectFontCapabilities.mockReturnValue({
      kind: "static",
      defaultWeight: 400,
      minWeight: 400,
      maxWeight: 400,
    });
    deps.store.selectItemById.mockReturnValue({
      id: "text-style-1",
      fontId: "font-1",
      fontWeight: "700",
    });

    await handleFormActionClick(
      deps,
      createSubmitPayload({ fontWeight: "700" }),
    );

    expect(updateTextStyle).toHaveBeenCalledWith(
      expect.objectContaining({
        textStyleId: "text-style-1",
        data: expect.objectContaining({ fontWeight: "700" }),
      }),
    );
  });

  it("loads a TTF's capabilities and selects its real static weight", async () => {
    let currentFormValues = {
      fontId: "font-600",
      fontWeight: "400",
    };
    const revoke = vi.fn();
    const deps = {
      store: {
        updateFormValues: vi.fn(({ formData }) => {
          currentFormValues = { ...currentFormValues, ...formData };
        }),
        selectCurrentFormValues: vi.fn(() => currentFormValues),
        selectFontCapabilities: vi.fn(),
        selectFontById: vi.fn(() => ({
          id: "font-600",
          type: "font",
          fileId: "file-600",
          fileType: "font/ttf",
        })),
        setFontCapabilities: vi.fn(),
        selectDialogState: vi.fn(() => ({ editMode: false })),
      },
      projectService: {
        getFileContent: vi.fn(async () => ({
          url: "blob:font-600",
          revoke,
        })),
      },
      refs: {
        textStyleForm: {
          setValues: vi.fn(),
        },
      },
      render: vi.fn(),
    };
    const fontBytes = createTestFontBytes({ weight: 600 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => fontBytes.buffer,
      })),
    );

    try {
      await handleDialogFormChange(deps, {
        _event: {
          detail: {
            name: "fontId",
            value: "font-600",
            values: currentFormValues,
          },
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(deps.store.setFontCapabilities).toHaveBeenCalledWith({
      fontId: "font-600",
      capabilities: {
        kind: "static",
        defaultWeight: 600,
        minWeight: 600,
        maxWeight: 600,
      },
    });
    expect(deps.refs.textStyleForm.setValues).toHaveBeenCalledWith({
      values: {
        fontId: "font-600",
        fontWeight: "600",
      },
    });
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("submits the desktop form through the fixed action button", async () => {
    const createTextStyle = vi.fn(async () => "text-style-new");
    const deps = createFormDeps({ createTextStyle });

    await handleDesktopTextStyleSubmitClick(deps);

    expect(deps.refs.textStyleForm.getValues).toHaveBeenCalledOnce();
    expect(createTextStyle).toHaveBeenCalledOnce();
  });

  it("submits with Enter outside textareas in the desktop form", async () => {
    const createTextStyle = vi.fn(async () => "text-style-new");
    const deps = createFormDeps({ createTextStyle });
    const preventDefault = vi.fn();

    await handleDesktopTextStyleFormKeyDown(deps, {
      _event: {
        key: "Enter",
        shiftKey: false,
        preventDefault,
        composedPath: () => [{ tagName: "RTGL-INPUT" }],
      },
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(createTextStyle).toHaveBeenCalledOnce();
  });

  it("keeps Enter available for multiline text in the desktop form", async () => {
    const createTextStyle = vi.fn(async () => "text-style-new");
    const deps = createFormDeps({ createTextStyle });
    const preventDefault = vi.fn();

    await handleDesktopTextStyleFormKeyDown(deps, {
      _event: {
        key: "Enter",
        shiftKey: false,
        preventDefault,
        composedPath: () => [{ tagName: "TEXTAREA" }],
      },
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(createTextStyle).not.toHaveBeenCalled();
  });

  it("duplicates a text style and selects the duplicate", async () => {
    const duplicateTextStyle = vi.fn(async () => "text-style-copy");
    let textStylesData = {
      items: {},
      tree: [],
    };
    const deps = {
      i18n: EN_I18N,
      store: {
        getState: () => ({ textStylesData }),
        setItems: vi.fn(({ textStylesData: nextTextStylesData } = {}) => {
          textStylesData = nextTextStylesData;
        }),
        setTagsData: vi.fn(),
        setColorsData: vi.fn(),
        setFontsData: vi.fn(),
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
        selectItemById: vi.fn((itemId) => textStylesData.items[itemId]),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      projectService: {
        duplicateTextStyle,
        getState: () => ({
          textStyles: {
            items: {
              "text-style-1": {
                id: "text-style-1",
                type: "textStyle",
                name: "Dialogue",
              },
              "text-style-copy": {
                id: "text-style-copy",
                type: "textStyle",
                name: "Dialogue",
              },
            },
            tree: [{ id: "text-style-1" }, { id: "text-style-copy" }],
          },
          colors: {
            items: {},
            tree: [],
          },
          fonts: {
            items: {},
            tree: [],
          },
        }),
      },
      appService: {
        showAlert: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleItemDuplicate(deps, {
      _event: {
        detail: {
          itemId: "text-style-1",
        },
      },
    });

    expect(duplicateTextStyle).toHaveBeenCalledWith({
      textStyleId: "text-style-1",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "text-style-copy",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "text-style-copy",
    });
  });

  it("opens the selected text style from the mobile detail edit action", () => {
    const item = {
      id: "text-style-1",
      type: "textStyle",
      name: "Dialogue",
      colorId: "color-1",
      fontId: "font-1",
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "400",
    };
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "text-style-1"),
        selectItemById: vi.fn(() => item),
        setSelectedItemId: vi.fn(),
        setFormValuesFromItem: vi.fn(),
        setEditMode: vi.fn(),
        selectIsDialogOpen: vi.fn(() => false),
        toggleDialog: vi.fn(),
        selectFontCapabilities: vi.fn(() => ({ kind: "unrestricted" })),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleMobileDetailEditClick(deps, {
      _event: event,
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "text-style-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "text-style-1",
    });
    expect(deps.store.setFormValuesFromItem).toHaveBeenCalledWith({ item });
    expect(deps.store.setEditMode).toHaveBeenCalledWith({
      itemId: "text-style-1",
    });
    expect(deps.store.toggleDialog).toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalled();
  });
});
