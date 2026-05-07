import { describe, expect, it, vi } from "vitest";
import {
  handleFormActionClick,
  handleItemDuplicate,
} from "../../src/pages/textStyles/textStyles.handlers.js";

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
    store: {
      getState: () => ({
        currentFormValues: {
          previewText: "Preview",
        },
      }),
      selectDialogState: vi.fn(() => dialogState),
      resetFormValues: vi.fn(),
      clearEditMode: vi.fn(),
      toggleDialog: vi.fn(),
      setItems: vi.fn(),
      setTagsData: vi.fn(),
      setColorsData: vi.fn(),
      setFontsData: vi.fn(),
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
          fontStyle: "font-1",
          fontWeight: "400",
          strokeColor: "",
          strokeWidth: 0,
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
        }),
      }),
    );
  });

  it("duplicates a text style and selects the duplicate", async () => {
    const duplicateTextStyle = vi.fn(async () => "text-style-copy");
    let textStylesData = {
      items: {},
      tree: [],
    };
    const deps = {
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
});
