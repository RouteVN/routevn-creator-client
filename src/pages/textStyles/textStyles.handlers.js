import { generateId } from "../../internal/id.js";
import {
  getTextStyleCount,
  getTextStyleRemovalCount,
} from "../../constants/textStyles.js";
import { buildFontResourceDataFromUploadResult } from "../../deps/services/shared/resourceImports.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { tap } from "rxjs";
import { TEXT_STYLE_TAG_SCOPE_KEY } from "./textStyles.store.js";

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
  store.setFontsData({ fontsData: state?.fonts });
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        syncRepositoryToStore({ store, repositoryState });
        render();
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

export const handleAfterMount = (deps) => {
  focusFileExplorerKeyboardScope(deps);
};

const refreshTextStylesData = async (deps, { selectedItemId } = {}) => {
  const { store, render, projectService, refs } = deps;
  syncRepositoryToStore({ store, projectService });
  if (selectedItemId !== undefined) {
    store.setSelectedItemId({ itemId: selectedItemId });
  }
  render();

  if (selectedItemId) {
    refs?.fileExplorer?.selectItem?.({ itemId: selectedItemId });
  }
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "textStyles",
    refresh: refreshTextStylesData,
  });
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers();

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
  refreshAfterItemTagUpdate: ({ deps, itemId }) =>
    refreshTextStylesData(deps, { selectedItemId: itemId }),
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode !== "form") {
      return;
    }

    appendTagIdToForm({
      form: deps.refs.textStyleForm,
      tagId,
    });
  },
  createTagFallbackMessage: "Failed to create tag.",
  updateItemTagFallbackMessage: "Failed to update text style tags.",
});

export {
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
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

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
  focusFileExplorerKeyboardScope(deps);
};

export const handleTextStyleItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId({ itemId: itemId });
  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });

  render();
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { store, render, refs } = deps;
  const item = store.selectItemById(itemId);
  if (!item) {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer?.selectItem?.({ itemId });
  store.setFormValuesFromItem({ item });
  store.setEditMode({ itemId });
  if (!store.getState().isDialogOpen) {
    store.toggleDialog();
  }
  render();
};

const buildTextStyleData = ({
  name,
  description,
  tagIds,
  fontSize,
  lineHeight,
  fontColor,
  fontStyle,
  fontWeight,
  previewText,
  strokeColor,
  strokeWidth,
  clearOutlineColor = false,
} = {}) => {
  const hasStrokeColor = Boolean(strokeColor);
  const textStyleData = {
    name,
    description: description ?? "",
    tagIds: Array.isArray(tagIds) ? tagIds : [],
    fontSize: Number(fontSize ?? 16),
    lineHeight: Number(lineHeight ?? 1.5),
    colorId: fontColor,
    fontId: fontStyle,
    fontWeight: String(fontWeight ?? "400"),
    previewText: previewText ?? "",
    strokeWidth: hasStrokeColor ? Number(strokeWidth ?? 0) : 0,
  };

  if (hasStrokeColor) {
    textStyleData.strokeColorId = strokeColor;
  } else if (clearOutlineColor) {
    textStyleData.strokeColorId = undefined;
  }

  return textStyleData;
};

const handleTextStyleCreated = async (deps, payload) => {
  const { appService, projectService } = deps;
  const {
    groupId,
    name,
    description,
    tagIds,
    fontSize,
    lineHeight,
    fontColor,
    fontStyle,
    fontWeight,
    previewText,
    strokeColor,
    strokeWidth,
  } = payload._event.detail;

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create text style.",
    action: () =>
      projectService.createTextStyle({
        textStyleId: generateId(),
        data: {
          type: "textStyle",
          ...buildTextStyleData({
            name,
            description,
            tagIds,
            fontSize,
            lineHeight,
            fontColor,
            fontStyle,
            fontWeight,
            previewText,
            strokeColor,
            strokeWidth,
          }),
        },
        parentId: groupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    return createAttempt.result ?? { valid: false };
  }

  await refreshTextStylesData(deps);
  return createAttempt.result;
};

const handleTextStyleUpdated = async (deps, payload) => {
  const { appService, projectService } = deps;
  const {
    itemId,
    name,
    description,
    tagIds,
    fontSize,
    lineHeight,
    fontColor,
    fontStyle,
    fontWeight,
    previewText,
    strokeColor,
    strokeWidth,
  } = payload._event.detail;

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update text style.",
    action: () =>
      projectService.updateTextStyle({
        textStyleId: itemId,
        data: buildTextStyleData({
          name,
          description,
          tagIds,
          fontSize,
          lineHeight,
          fontColor,
          fontStyle,
          fontWeight,
          previewText,
          strokeColor,
          strokeWidth,
          clearOutlineColor: true,
        }),
      }),
  });

  if (!updateAttempt.ok) {
    return updateAttempt.result ?? { valid: false };
  }

  await refreshTextStylesData(deps);
  return updateAttempt.result;
};

export const handleFormExtraEvent = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

// Dialog handlers
export const handleAddTextStyleClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;

  store.setTargetGroupId({ groupId: groupId });
  store.clearEditMode();
  store.resetFormValues(); // Reset form values for a new text style
  store.toggleDialog();
  render();
};

export const handleTextStyleItemDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openEditDialogWithValues({ deps, itemId });
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

export const handleTextStyleFormAddOptionClick = (deps, payload) => {
  if (payload?._event?.detail?.name !== "tagIds") {
    return;
  }

  openCreateTagDialogForMode({
    deps,
    mode: "form",
    itemId: deps.store.selectDialogState().editingItemId,
  });
};

export const handleDialogFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, value, values } = payload._event.detail;

  const formData = {
    ...values,
  };

  if (name) {
    formData[name] = value ?? "";
  }

  // Update form values for preview
  store.updateFormValues({ formData });
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;

  // Reset form values, clear edit mode, and close dialog
  store.resetFormValues();
  store.clearEditMode();
  store.toggleDialog();
  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { store, render, appService } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  // Handle add option for color selector
  if (
    actionId === "select-options-add" &&
    (payload._event.detail.name === "fontColor" ||
      payload._event.detail.name === "strokeColor")
  ) {
    // Open the add color dialog
    store.openAddColorDialog();
    render();
    return;
  }

  // Handle add option for font selector
  if (
    actionId === "select-options-add" &&
    payload._event.detail.name === "fontStyle"
  ) {
    // Open the add font dialog
    store.openAddFontDialog();
    render();
    return;
  }

  if (actionId === "submit") {
    // Get form values from the event detail
    const formData = payload._event.detail.values;

    // Get the store state using selector
    const { targetGroupId, editMode, editingItemId } =
      store.selectDialogState();

    // Validate required fields (dropdowns ensure valid color and font selections)
    if (
      !formData.name ||
      !formData.fontSize ||
      !formData.fontColor ||
      !formData.fontStyle ||
      !formData.fontWeight
    ) {
      appService.showAlert({
        message: "Please fill in all required fields",
        title: "Warning",
      });
      return;
    }

    // Validate font size is a number
    if (isNaN(formData.fontSize) || parseInt(formData.fontSize) <= 0) {
      appService.showAlert({
        message: "Please enter a valid font size (positive number)",
        title: "Warning",
      });
      return;
    }

    const strokeWidth = Number(formData.strokeWidth ?? 0);
    if (Number.isNaN(strokeWidth) || strokeWidth < 0) {
      appService.showAlert({
        message: "Please enter a valid outline thickness (0 or greater)",
        title: "Warning",
      });
      return;
    }

    let submitResult;

    if (editMode && editingItemId) {
      // Handle text style update
      submitResult = await handleTextStyleUpdated(deps, {
        _event: {
          detail: {
            itemId: editingItemId,
            name: formData.name,
            description: formData.description,
            tagIds: formData.tagIds,
            fontSize: formData.fontSize,
            lineHeight: formData.lineHeight,
            fontColor: formData.fontColor,
            fontStyle: formData.fontStyle,
            fontWeight: formData.fontWeight,
            previewText: formData.previewText,
            strokeColor: formData.strokeColor,
            strokeWidth: formData.strokeWidth,
          },
        },
      });
    } else {
      // Handle text style creation
      submitResult = await handleTextStyleCreated(deps, {
        _event: {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            description: formData.description,
            tagIds: formData.tagIds,
            fontSize: formData.fontSize,
            lineHeight: formData.lineHeight,
            fontColor: formData.fontColor,
            fontStyle: formData.fontStyle,
            fontWeight: formData.fontWeight,
            previewText: formData.previewText,
            strokeColor: formData.strokeColor,
            strokeWidth: formData.strokeWidth,
          },
        },
      });
    }

    if (submitResult?.valid === false) {
      return;
    }

    // Reset form values, clear edit mode, and close dialog
    store.resetFormValues();
    store.clearEditMode();
    store.toggleDialog();
    render();
  }
};

// Add color dialog handlers
export const handleAddColorDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddColorDialog();
  render();
};

export const handleAddColorFormAction = async (deps, payload) => {
  const { appService, store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const newColorId = generateId();

    // Create the color in the repository
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create color.",
      action: () =>
        projectService.createColor({
          colorId: newColorId,
          data: {
            type: "color",
            name: formData.name,
            description: formData.description ?? "",
            hex: formData.hex,
          },
          parentId: formData.folderId || null,
          position: "last",
        }),
    });

    if (!createAttempt.ok) {
      return;
    }

    // Sync repository to store to ensure all data is updated
    syncRepositoryToStore({ store, projectService });

    // Don't update the form values - keep preview consistent with form state
    // The user can manually select the new color from the dropdown

    // Close the add color dialog
    store.closeAddColorDialog();
    render();
  }
};

// Add font dialog handlers
export const handleAddFontDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddFontDialog();
  render();
};

export const handleFontFileSelected = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { files } = payload._event.detail;

  if (files && files.length > 0) {
    const file = files[0];
    // Extract font name from file name (remove extension)
    const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, "");

    try {
      // Upload the file immediately when selected
      const uploadResults = await projectService.uploadFiles([file]);

      if (uploadResults.length === 0) {
        showResourcePageError({
          appService,
          errorOrResult: "Failed to upload font file.",
          fallbackMessage: "Failed to upload font file.",
        });
        return;
      }

      const uploadResult = uploadResults[0];
      store.setSelectedFontFile({
        file,
        fileName: fontName,
        uploadResult, // Store the upload result for later use
      });
      render();
    } catch (error) {
      showResourcePageError({
        appService,
        errorOrResult: error,
        fallbackMessage: "Failed to upload font file.",
      });
    }
  }
};

export const handleAddFontFormAction = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const fontData = store.selectSelectedFontData();

    // Check if a font file was selected and uploaded
    if (!fontData || !fontData.uploadResult) {
      appService.showAlert({
        message: "Please select a font file",
        title: "Warning",
      });
      return;
    }

    const fontName = fontData.fileName;
    const newFontId = generateId();

    // Create the font in the repository using the already uploaded file
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create font.",
      action: () =>
        projectService.createFont({
          fontId: newFontId,
          fileRecords: fontData.uploadResult.fileRecords,
          data: buildFontResourceDataFromUploadResult({
            uploadResult: fontData.uploadResult,
            name: fontName,
            description: formData.description ?? "",
            fontFamily: fontName,
          }),
          parentId: formData.folderId || null,
          position: "last",
        }),
    });

    if (!createAttempt.ok) {
      return;
    }

    // Sync repository to store to ensure all data is updated
    syncRepositoryToStore({ store, projectService });

    // Clear selected font data and close dialog
    store.clearSelectedFontFile();
    store.closeAddFontDialog();
    render();
  }
};
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value ?? "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const state = projectService.getState();

  const textStyleCount = getTextStyleCount(state.textStyles);
  const removalCount = getTextStyleRemovalCount(state.textStyles, itemId);
  if (textStyleCount - removalCount < 1) {
    appService.showAlert({ message: "At least one text style must remain." });
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
      message: "Cannot delete resource, it is currently in use.",
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

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to duplicate text style.",
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
