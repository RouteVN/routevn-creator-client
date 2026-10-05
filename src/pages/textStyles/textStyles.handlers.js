import { generateId } from "../../internal/id.js";
import {
  getTextStyleCount,
  getTextStyleRemovalCount,
} from "../../constants/textStyles.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createTextStyleEditorPayload } from "../../internal/textStyleEditorRoute.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { handleResourceZoomShortcutKeyDown } from "../../internal/ui/resourcePages/zoomShortcuts.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import {
  closeMobileResourceFileExplorerAfterSelection,
  handleMobileResourceDetailSheetClose,
  handleMobileResourceFileExplorerClose,
  handleMobileResourceFileExplorerOpen,
  mountMobileResourceWindowLayout,
  shouldSuppressMobileDetailSheetForFileExplorerSelection,
  syncMobileResourcePageUiConfig,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { tap } from "rxjs";
import { TEXT_STYLE_TAG_SCOPE_KEY } from "./textStyles.store.js";
import { selectTextStylesPageCopy } from "./support/textStylesPageCopy.js";
import { clearResourcePageSelection } from "../../internal/ui/resourcePages/resourceViewBackground.js";
import { getMediaPageData } from "../../internal/ui/resourcePages/media/mediaPageShared.js";

const selectCopy = (deps = {}) => selectTextStylesPageCopy(deps.i18n);

// A new text style's size and spacing; the editor changes them.
const NEW_TEXT_STYLE_FONT_SIZE = 16;
const NEW_TEXT_STYLE_LINE_HEIGHT = 1.5;

const navigateToEditor = ({ appService, textStyleId } = {}) => {
  if (!textStyleId) {
    return;
  }

  appService.navigate(
    "/project/text-style-editor",
    createTextStyleEditorPayload({
      payload: appService.getPayload() ?? {},
      textStyleId,
    }),
  );
};

const createMetadataValues = (values) => ({
  name: values.name?.trim() ?? "",
  description: values.description ?? "",
  tagIds: Array.isArray(values.tagIds) ? values.tagIds : [],
});

// Helper function to sync repository state to store
const syncRepositoryToStore = ({
  store,
  repositoryState,
  projectService,
} = {}) => {
  const state =
    repositoryState ??
    projectService.getRepositoryState?.() ??
    projectService.getState();
  const tagsData = getTagsCollection(state, TEXT_STYLE_TAG_SCOPE_KEY);

  store.setTagsData({ tagsData });
  store.setItems({
    textStylesData: resolveCollectionWithTags({
      collection: state?.textStyles,
      tagsCollection: tagsData,
      itemType: "textStyle",
    }),
  });
  store.setColorsData({ colorsData: state?.colors });
  store.setFontsData({
    fontsData: getMediaPageData({
      repositoryState: state,
      resourceType: "fonts",
    }),
  });
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  syncMobileResourcePageUiConfig(deps);
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        syncRepositoryToStore({ store, repositoryState });
        render();
      }),
    )
    .subscribe();
  const cleanupWindowLayout = mountMobileResourceWindowLayout(deps);

  return () => {
    subscription.unsubscribe();
    cleanupWindowLayout?.();
  };
};

export const handleAfterMount = (deps) => {
  focusFileExplorerKeyboardScope(deps);
};

const refreshTextStylesData = async (deps, { selectedItemId } = {}) => {
  const { store, render, projectService, refs } = deps;
  syncRepositoryToStore({ store, projectService });
  if (selectedItemId !== undefined) {
    const item = store.selectItemById(selectedItemId);
    if (item?.type === "folder") {
      store.setSelectedFolderId({ folderId: selectedItemId });
    } else {
      store.setSelectedFolderId({ folderId: undefined });
      store.setSelectedItemId({ itemId: item ? selectedItemId : undefined });
    }
  }
  render();

  if (selectedItemId) {
    refs?.fileExplorer?.selectItem?.({ itemId: selectedItemId });
  }
};

const {
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createResourceFileExplorerHandlers({
  resourceType: "textStyles",
  refresh: refreshTextStylesData,
  copy: selectCopy,
});
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  onEditKey: ({ deps, selectedItemId, selectedExplorerItem }) => {
    if (selectedExplorerItem?.isFolder) {
      openFolderNameDialogWithValues({ deps, folderId: selectedItemId });
      return;
    }

    navigateToEditor({
      appService: deps.appService,
      textStyleId: selectedItemId,
    });
  },
  resolveSelectedItemId: ({ deps, selectedExplorerItem }) =>
    selectedExplorerItem?.isFolder
      ? undefined
      : (selectedExplorerItem?.itemId ?? deps.store.selectSelectedItemId()),
});

const {
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createResourcePageTagHandlers({
  resolveScopeKey: () => TEXT_STYLE_TAG_SCOPE_KEY,
  updateItemTagIds: ({ deps, itemId, tagIds }) =>
    deps.projectService.updateTextStyle({
      textStyleId: itemId,
      data: {
        tagIds,
      },
    }),
  refreshAfterItemTagUpdate: ({ deps, itemId, itemStillSelected }) =>
    refreshTextStylesData(deps, {
      selectedItemId: itemStillSelected ? itemId : undefined,
    }),
  // A tag created from the add or edit form goes into that form.
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    const { refs } = deps;
    if (mode === "add-form") {
      appendTagIdToForm({ form: refs.addForm, tagId });
    } else if (mode === "edit-form") {
      appendTagIdToForm({ form: refs.editForm, tagId });
    }
  },
  createTagFallbackMessage: ({ deps }) =>
    selectCopy(deps).failedCreateTag ?? "Failed to create tag.",
  updateItemTagFallbackMessage: ({ deps }) =>
    selectCopy(deps).failedUpdateTags ?? "Failed to update text style tags.",
  copy: selectCopy,
});

export {
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleMobileResourceFileExplorerOpen as handleMobileFileExplorerOpen,
  handleMobileResourceFileExplorerClose as handleMobileFileExplorerClose,
  handleMobileResourceDetailSheetClose as handleMobileDetailSheetClose,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export const handleDataChanged = refreshTextStylesData;

// Open in the explorer's menu opens the text style in the editor.
export const handleFileExplorerAction = async (deps, payload) => {
  const { appService } = deps;
  const { itemId, item } = payload._event.detail;
  if (item?.value === "edit-item") {
    navigateToEditor({ appService, textStyleId: itemId });
    return;
  }

  await handleBaseFileExplorerAction(deps, payload);
};

export const handleFileExplorerKeyboardScopeKeyDown = (deps, payload) => {
  if (
    handleResourceZoomShortcutKeyDown(deps, payload, {
      refName: "typographyView",
    })
  ) {
    return;
  }

  handleBaseFileExplorerKeyboardScopeKeyDown(deps, payload);
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedFolderId({ folderId: itemId });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  if (!itemId) {
    store.setSelectedFolderId({ folderId: undefined });
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  store.setSelectedFolderId({ folderId: undefined });
  const selectionPayload = { itemId };
  if (shouldSuppressMobileDetailSheetForFileExplorerSelection(deps)) {
    selectionPayload.suppressMobileDetailSheet = true;
  }
  store.setSelectedItemId(selectionPayload);
  closeMobileResourceFileExplorerAfterSelection(deps);
  render();
  focusFileExplorerKeyboardScope(deps);
};

export const handleTextStyleItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedFolderId({ folderId: undefined });
  store.setSelectedItemId({ itemId: itemId });
  const { fileExplorer } = refs;
  fileExplorer?.selectItem?.({ itemId });

  render();
};

export const handleResourceViewBackgroundClick = (deps) => {
  clearResourcePageSelection(deps);
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  const { refs, render, store } = deps;
  const { editForm, fileExplorer } = refs;
  const item = store.selectItemById(itemId);
  if (!item) {
    return;
  }

  const editValues = createMetadataValues(item);
  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });
  fileExplorer?.selectItem?.({ itemId });
  store.openEditDialog({ itemId, defaultValues: editValues });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

const openFolderNameDialogWithValues = ({ deps, folderId } = {}) => {
  const { store, render, refs } = deps;
  if (!folderId) {
    return;
  }

  const folder = store.selectFolderById({ folderId });
  if (!folder) {
    return;
  }

  const values = {
    name: folder.name ?? "",
    description: folder.description ?? "",
  };

  store.setSelectedFolderId({ folderId });
  refs.fileExplorer?.selectItem?.({ itemId: folderId });
  store.openFolderNameDialog({
    folderId,
    defaultValues: values,
  });
  render();
  refs.folderNameForm?.reset?.();
  refs.folderNameForm?.setValues?.({ values });
};

// The detail preview opens the text style in the editor.
export const handleDetailPreviewClick = (deps) => {
  const { appService, store } = deps;
  navigateToEditor({ appService, textStyleId: store.selectSelectedItemId() });
};

export const handleAddTextStyleClick = (deps, payload) => {
  const { render, store } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
  render();
};

// Double-click and long press open the text style in the editor.
export const handleTextStyleItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  navigateToEditor({ appService, textStyleId: itemId });
};

export const handleTextStyleItemEdit = (deps, payload) => {
  const { appService } = deps;
  const { itemId } = payload._event.detail;
  navigateToEditor({ appService, textStyleId: itemId });
};

export const handleMobileDetailOpenClick = (deps) => {
  const { appService, store } = deps;
  navigateToEditor({ appService, textStyleId: store.selectSelectedItemId() });
};

export const handleMobileDetailDuplicateClick = async (deps) => {
  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleItemDuplicate(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleMobileDetailDeleteClick = async (deps) => {
  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleItemDelete(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

// The detail header edits the text style's name, description and tags; how
// it looks is edited in the editor.
export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    openFolderNameDialogWithValues({
      deps,
      folderId: store.selectSelectedFolderId(),
    });
    return;
  }

  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

export const handleFolderNameDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeFolderNameDialog();
  render();
};

export const handleFolderNameFormAction = async (deps, payload) => {
  const { appService, store, render } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  const description = values?.description?.trim() ?? "";
  if (!name) {
    appService.showAlert({
      message: copy.folderNameRequired ?? "Folder name is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const folderId = store.selectFolderNameDialogItemId();
  if (!folderId) {
    store.closeFolderNameDialog();
    render();
    return;
  }

  await handleFileExplorerAction(deps, {
    _event: {
      detail: {
        value: "rename-item-confirmed",
        itemId: folderId,
        newName: name,
        description,
      },
    },
  });
  store.closeFolderNameDialog();
  render();
};

export const handleAddDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({ deps, mode: "add-form" });
};

// Creates the text style with the project's first font and color, and
// opens it in the editor, where they are changed.
export const handleAddFormAction = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const metadata = createMetadataValues(values);
  if (!metadata.name) {
    appService.showAlert({
      message: copy.textStyleNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const { fontId, colorId, fontWeight } = store.selectNewTextStyleResources();
  if (!fontId || !colorId) {
    appService.showAlert({
      message: copy.fontAndColorRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const data = {
    type: "textStyle",
    name: metadata.name,
    description: metadata.description,
    fontId: [fontId],
    colorId,
    fontSize: NEW_TEXT_STYLE_FONT_SIZE,
    lineHeight: NEW_TEXT_STYLE_LINE_HEIGHT,
    fontWeight,
  };
  if (metadata.tagIds.length > 0) {
    data.tagIds = metadata.tagIds;
  }

  const textStyleId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedCreateTextStyle,
    title: copy.errorTitle,
    action: () =>
      projectService.createTextStyle({
        textStyleId,
        data,
        parentId: store.selectTargetGroupId(),
        position: "last",
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  render();
  navigateToEditor({ appService, textStyleId });
};

export const handleEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "edit-form",
    itemId: deps.store.selectEditItemId(),
  });
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const metadata = createMetadataValues(values);
  if (!metadata.name) {
    appService.showAlert({
      message: copy.textStyleNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateTextStyle,
    title: copy.errorTitle,
    action: () =>
      projectService.updateTextStyle({
        textStyleId: editItemId,
        data: metadata,
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await refreshTextStylesData(deps, { selectedItemId: editItemId });
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value ?? "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;

  const state = projectService.getState();

  const textStyleCount = getTextStyleCount(state.textStyles);
  const removalCount = getTextStyleRemovalCount(state.textStyles, itemId);
  if (textStyleCount - removalCount < 1) {
    appService.showAlert({
      message:
        copy.minimumTextStyleRequired ?? "At least one text style must remain.",
    });
    render();
    return;
  }

  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["layouts"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message:
        copy.cannotDeleteResourceInUse ??
        "Cannot delete resource, it is currently in use.",
    });
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteTextStyles({
    textStyleIds: [itemId],
  });

  await refreshTextStylesData(deps);
};

// The copy has the text style's look, name, description, tags and preview
// text, and goes right after it, in its folder.
export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedDuplicateTextStyle ?? "Failed to duplicate text style.",
    action: () =>
      projectService.duplicateTextStyle({
        textStyleId: itemId,
      }),
  });
  if (!duplicateAttempt.ok) {
    return;
  }

  await refreshTextStylesData(deps, {
    selectedItemId: duplicateAttempt.result,
  });
};
