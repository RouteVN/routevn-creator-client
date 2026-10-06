import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as textStylesStore from "../../src/pages/textStyles/textStyles.store.js";
import {
  handleAddFormAction,
  handleAddFormAddOptionClick,
  handleAddTextStyleClick,
  handleCreateTagFormAction,
  handleDataChanged,
  handleDetailHeaderClick,
  handleDetailPreviewClick,
  handleEditFormAction,
  handleFileExplorerAction,
  handleFileExplorerKeyboardScopeKeyDown,
  handleItemDuplicate,
  handleMobileDetailDuplicateClick,
  handleMobileDetailOpenClick,
  handleTextStyleItemDoubleClick,
  handleTextStyleItemEdit,
} from "../../src/pages/textStyles/textStyles.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createTextStyle = () => ({
  id: "text-style-1",
  type: "textStyle",
  name: "Text Style One",
  description: "Dialogue text.",
  tagIds: ["tag-1"],
  fontId: ["font-1"],
  colorId: "color-1",
  fontSize: 24,
  lineHeight: 1.5,
  fontWeight: "400",
  previewText: "Preview One",
});

// The page on its real store, with a project of one text style.
const createPage = async ({ fonts, colors } = {}) => {
  let state = textStylesStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return textStylesStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = textStylesStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const repositoryState = {
    tags: {
      textStyles: {
        items: { "tag-1": { id: "tag-1", type: "tag", name: "Dialogue" } },
        tree: [{ id: "tag-1" }],
      },
    },
    colors: colors ?? {
      items: {
        "color-1": { id: "color-1", type: "color", name: "White", hex: "#fff" },
      },
      tree: [{ id: "color-1" }],
    },
    fonts: fonts ?? {
      items: {
        "font-1": {
          id: "font-1",
          type: "font",
          name: "font-1.ttf",
          fontFamily: "Font One",
          fileId: "file-1",
        },
        "font-2": {
          id: "font-2",
          type: "font",
          name: "font-2.ttf",
          fontFamily: "Font Two",
          fileId: "file-2",
          minWeight: 700,
          defaultWeight: 700,
          maxWeight: 700,
        },
      },
      tree: [{ id: "font-1" }, { id: "font-2" }],
    },
    files: { items: {}, tree: [] },
    textStyles: {
      items: {
        "folder-1": { id: "folder-1", type: "folder", name: "Folder One" },
        "text-style-1": createTextStyle(),
      },
      tree: [{ id: "folder-1", children: [{ id: "text-style-1" }] }],
    },
  };
  // The store keeps what it reads, frozen, so the project changes by
  // replacing its collections.
  const withItem = (collection, id, data) => ({
    items: { ...collection.items, [id]: { id, ...data } },
    tree: [...collection.tree, { id }],
  });
  const deps = {
    store,
    i18n: EN_I18N,
    render: vi.fn(),
    refs: {
      fileExplorer: {
        selectItem: vi.fn(),
        getSelectedItem: vi.fn(() => ({
          itemId: "text-style-1",
          isFolder: false,
        })),
      },
      addForm: { getValues: vi.fn(() => ({ tagIds: [] })), setValues: vi.fn() },
      editForm: { reset: vi.fn(), setValues: vi.fn() },
    },
    appService: {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      reportError: vi.fn(),
    },
    projectService: {
      getRepositoryState: vi.fn(() => repositoryState),
      getState: vi.fn(() => repositoryState),
      createTextStyle: vi.fn(async ({ textStyleId, data }) => {
        repositoryState.textStyles = withItem(
          repositoryState.textStyles,
          textStyleId,
          data,
        );
        return { valid: true };
      }),
      updateTextStyle: vi.fn(async ({ textStyleId, data }) => {
        const { items, tree } = repositoryState.textStyles;
        repositoryState.textStyles = {
          items: {
            ...items,
            [textStyleId]: { ...items[textStyleId], ...data },
          },
          tree,
        };
        return { valid: true };
      }),
      duplicateTextStyle: vi.fn(async ({ textStyleId }) => {
        repositoryState.textStyles = withItem(
          repositoryState.textStyles,
          "text-style-copy",
          { ...repositoryState.textStyles.items[textStyleId] },
        );
        return "text-style-copy";
      }),
      createTag: vi.fn(async ({ scopeKey, tagId, data }) => {
        repositoryState.tags = {
          ...repositoryState.tags,
          [scopeKey]: withItem(repositoryState.tags[scopeKey], tagId, data),
        };
        return { valid: true };
      }),
    },
  };
  await handleDataChanged(deps);
  return {
    deps,
    state: () => state,
    view: () => textStylesStore.selectViewData({ state, i18n: EN_I18N }),
    repositoryState,
  };
};

const editorCall = (textStyleId) => [
  "/project/text-style-editor",
  { p: "project-1", ts: textStyleId },
];

const submitAdd = (deps, values) =>
  handleAddFormAction(deps, {
    _event: { detail: { actionId: "submit", values } },
  });

describe("textStyles handlers", () => {
  it("opens text styles in the editor", async () => {
    const page = await createPage();
    const { deps } = page;
    deps.store.setSelectedItemId({ itemId: "text-style-1" });

    handleTextStyleItemDoubleClick(deps, {
      _event: { detail: { itemId: "text-style-1" } },
    });
    handleTextStyleItemEdit(deps, {
      _event: { detail: { itemId: "text-style-1" } },
    });
    handleMobileDetailOpenClick(deps);
    handleDetailPreviewClick(deps);
    await handleFileExplorerAction(deps, {
      _event: {
        detail: { itemId: "text-style-1", item: { value: "edit-item" } },
      },
    });
    const keyEvent = {
      key: "e",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      composedPath: () => [],
    };
    handleFileExplorerKeyboardScopeKeyDown(deps, { _event: keyEvent });
    handleTextStyleItemDoubleClick(deps, {
      _event: { detail: { itemId: "folder-1", isFolder: true } },
    });

    expect(deps.appService.navigate.mock.calls).toEqual([
      editorCall("text-style-1"),
      editorCall("text-style-1"),
      editorCall("text-style-1"),
      editorCall("text-style-1"),
      editorCall("text-style-1"),
      editorCall("text-style-1"),
    ]);
    expect(keyEvent.preventDefault).toHaveBeenCalled();
  });

  it("adds a text style with the first font and color, and opens it", async () => {
    const page = await createPage();
    const { deps } = page;
    handleAddTextStyleClick(deps, {
      _event: { detail: { groupId: "folder-1" } },
    });
    expect(page.view().isAddDialogOpen).toBe(true);

    await submitAdd(deps, {
      name: " Text Style Two ",
      description: "Narration.",
      tagIds: ["tag-1"],
    });

    const [{ textStyleId, data, parentId, position }] =
      deps.projectService.createTextStyle.mock.calls[0];
    expect(data).toEqual({
      type: "textStyle",
      name: "Text Style Two",
      description: "Narration.",
      tagIds: ["tag-1"],
      fontId: ["font-1"],
      colorId: "color-1",
      fontSize: 16,
      lineHeight: 1.5,
      fontWeight: "400",
    });
    expect(parentId).toBe("folder-1");
    expect(position).toBe("last");
    expect(page.view().isAddDialogOpen).toBe(false);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      ...editorCall(textStyleId),
    );
  });

  it("starts a new text style at its font's own weight, without empty tags", async () => {
    const page = await createPage({
      fonts: {
        items: {
          "font-2": {
            id: "font-2",
            type: "font",
            fontFamily: "Font Two",
            fileId: "file-2",
            minWeight: 700,
            defaultWeight: 700,
            maxWeight: 700,
          },
        },
        tree: [{ id: "font-2" }],
      },
    });
    handleAddTextStyleClick(page.deps, {
      _event: { detail: { groupId: "_root" } },
    });

    await submitAdd(page.deps, { name: "Text Style Two", tagIds: [] });

    const [{ data, parentId }] =
      page.deps.projectService.createTextStyle.mock.calls[0];
    expect(data).toMatchObject({ fontId: ["font-2"], fontWeight: "700" });
    expect(data).not.toHaveProperty("tagIds");
    expect(parentId).toBeUndefined();
  });

  it("asks for a name, and for a font and a color in the project", async () => {
    const page = await createPage({ colors: { items: {}, tree: [] } });
    const { deps } = page;

    await submitAdd(deps, { name: " " });
    expect(deps.appService.showAlert).toHaveBeenLastCalledWith({
      message: "Text style name is required.",
      title: "Warning",
    });

    await submitAdd(deps, { name: "Text Style Two" });
    expect(deps.appService.showAlert).toHaveBeenLastCalledWith({
      message:
        "Add a font and a color to the project before adding a text style.",
      title: "Warning",
    });
    expect(deps.projectService.createTextStyle).not.toHaveBeenCalled();
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("puts a tag created from the add form into the form", async () => {
    const page = await createPage();
    const { deps } = page;

    handleAddFormAddOptionClick(deps);
    expect(page.view().isCreateTagDialogOpen).toBe(true);
    await handleCreateTagFormAction(deps, {
      _event: {
        detail: { actionId: "submit", values: { name: "Narration" } },
      },
    });

    const [{ tagId }] = deps.projectService.createTag.mock.calls[0];
    expect(deps.refs.addForm.setValues).toHaveBeenCalledWith({
      values: { tagIds: [tagId] },
    });
  });

  it("edits the name, description and tags from the detail header", async () => {
    const page = await createPage();
    const { deps } = page;
    deps.store.setSelectedItemId({ itemId: "text-style-1" });

    handleDetailHeaderClick(deps);

    const values = {
      name: "Text Style One",
      description: "Dialogue text.",
      tagIds: ["tag-1"],
    };
    expect(page.view()).toMatchObject({
      isEditDialogOpen: true,
      editDefaultValues: values,
    });
    expect(deps.refs.editForm.reset).toHaveBeenCalledOnce();
    expect(deps.refs.editForm.setValues).toHaveBeenCalledWith({ values });

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: { name: " Text Style Renamed ", description: "", tagIds: [] },
        },
      },
    });

    expect(deps.projectService.updateTextStyle).toHaveBeenCalledWith({
      textStyleId: "text-style-1",
      data: { name: "Text Style Renamed", description: "", tagIds: [] },
    });
    expect(page.view()).toMatchObject({
      isEditDialogOpen: false,
      selectedItemId: "text-style-1",
      selectedDetailName: "Text Style Renamed",
    });
  });

  it("duplicates a text style from the center menu and the phone detail sheet", async () => {
    const page = await createPage();
    const { deps } = page;

    await handleItemDuplicate(deps, {
      _event: { detail: { itemId: "text-style-1" } },
    });
    expect(deps.projectService.duplicateTextStyle).toHaveBeenCalledWith({
      textStyleId: "text-style-1",
    });
    expect(page.view().selectedItemId).toBe("text-style-copy");
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenLastCalledWith({
      itemId: "text-style-copy",
    });

    deps.store.setSelectedItemId({ itemId: "text-style-1" });
    await handleMobileDetailDuplicateClick(deps);
    expect(deps.projectService.duplicateTextStyle).toHaveBeenCalledTimes(2);
  });
});
