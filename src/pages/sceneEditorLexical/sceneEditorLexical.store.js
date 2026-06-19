import {
  buildLayoutElements,
  isFragmentLayout,
} from "../../internal/project/layout.js";
import {
  toFlatItems,
  toHierarchyStructure,
} from "../../internal/project/tree.js";
import { buildSceneDocumentLineDecorations } from "../../internal/ui/sceneEditor/lineViewModels.js";
import {
  cloneSceneEditorLines,
  overlaySceneWithDraftSections,
} from "../../internal/ui/sceneEditorLexical/draftSection.js";
import {
  constructProjectData,
  getSectionPresentation,
} from "../../internal/project/projection.js";
import {
  formatBackgroundTransformEditorMetric,
  normalizeBackgroundTransformEditorTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

const INACTIVE_SECTION_EDITOR_SELECTED_LINE_ID = "";

const SCENE_EDITOR_FONT_SIZE_OPTIONS = [
  { value: "xs", label: "Extra Small" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];
const DEFAULT_SCENE_EDITOR_FONT_SIZE = "md";
const MOBILE_KEYBOARD_TOOLBAR_HEIGHT_PX = 48;
const MOBILE_PREVIEW_VERTICAL_PADDING_PX = 16;
const MOBILE_PREVIEW_MIN_HEIGHT_PX = 72;

const normalizeSceneEditorFontSize = (fontSize) =>
  SCENE_EDITOR_FONT_SIZE_OPTIONS.some((option) => option.value === fontSize)
    ? fontSize
    : DEFAULT_SCENE_EDITOR_FONT_SIZE;

const appendMissingIds = (orderedIds, allIds) => {
  const seen = new Set();
  const result = [];

  for (const id of orderedIds || []) {
    if (!allIds.includes(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  for (const id of allIds || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
};

const getOrderedIdsFromHierarchy = (tree, fallbackIds) => {
  const orderedFromHierarchy = Array.isArray(tree)
    ? tree
        .map((node) =>
          typeof node?.id === "string" && node.id.length > 0 ? node.id : null,
        )
        .filter((id) => id !== null)
    : [];

  return appendMissingIds(orderedFromHierarchy, fallbackIds);
};

const toPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const mergePresentationStates = (
  presentationState,
  temporaryPresentationState,
) => {
  return {
    ...toPlainObject(presentationState),
    ...toPlainObject(temporaryPresentationState),
  };
};

const getSectionLineChangesForSection = (state, sectionId) => {
  if (sectionId) {
    if (
      Object.prototype.hasOwnProperty.call(
        state.sectionLineChangesBySectionId ?? {},
        sectionId,
      )
    ) {
      return state.sectionLineChangesBySectionId[sectionId] ?? {};
    }

    return sectionId === state.selectedSectionId
      ? (state.sectionLineChanges ?? {})
      : {};
  }

  return state.sectionLineChanges ?? {};
};

const getSectionLinePresentationState = (state, lineId) => {
  const sectionLineChanges = getSectionLineChangesForSection(
    state,
    state.selectedSectionId,
  );
  const selectedLineEntry = (sectionLineChanges?.lines || []).find(
    (line) => line.id === lineId,
  );
  if (!selectedLineEntry) {
    return undefined;
  }

  return toPlainObject(selectedLineEntry.presentationState);
};

const collectActionTargetSectionIds = (actions) => {
  const sectionIds = new Set();

  const scanActionValue = (value, key) => {
    if (key === "when") {
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    if (
      (key === "sectionTransition" || key === "resetStoryAtSection") &&
      typeof value.sectionId === "string" &&
      value.sectionId.length > 0
    ) {
      sectionIds.add(value.sectionId);
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => scanActionValue(entry));
      return;
    }

    Object.entries(value).forEach(([entryKey, entryValue]) => {
      scanActionValue(entryValue, entryKey);
    });
  };

  scanActionValue(actions);

  return [...sectionIds];
};

const toFlatTree = (ids = []) => {
  return ids.map((id) => ({ id }));
};

const buildTextStyleOptions = (repositoryState = {}) => {
  const textStyles = repositoryState.textStyles || { items: {}, tree: [] };
  const textStyleItems = textStyles.items || {};
  const orderedIds = getOrderedIdsFromHierarchy(
    textStyles.tree,
    Object.keys(textStyleItems),
  );

  return orderedIds
    .map((id) => textStyleItems[id])
    .filter((item) => item?.type === "textStyle" && item?.id)
    .map((item) => ({
      id: item.id,
      name: item.name || item.id,
    }));
};

const MENTION_VARIABLE_TYPES = new Set(["string", "number", "integer"]);

const buildMentionTargetOptions = (repositoryState = {}) => {
  const variablesData = repositoryState.variables || { items: {}, tree: [] };
  const variableItems = variablesData.items || {};
  const flatItems = toFlatItems(variablesData);
  const seenIds = new Set(flatItems.map((item) => item.id));

  for (const [id, item] of Object.entries(variableItems)) {
    if (seenIds.has(id)) {
      continue;
    }

    flatItems.push({
      id,
      ...item,
    });
  }

  return flatItems
    .filter((item) => {
      const variableType = String(item?.variableType ?? "").toLowerCase();
      return MENTION_VARIABLE_TYPES.has(variableType);
    })
    .map((item) => ({
      id: item.id,
      label: item.name || item.id,
      variableType: String(item.variableType).toLowerCase(),
    }));
};

const buildMoveSectionSceneOptions = (repositoryState = {}, currentSceneId) => {
  const scenesData = repositoryState.scenes || { items: {}, tree: [] };
  return toFlatItems(scenesData)
    .filter((item) => item?.type === "scene" && item.id !== currentSceneId)
    .map((item) => ({
      value: item.id,
      label: item.name ?? item.id,
    }));
};

const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const sanitizeDialogueContentInlineTextStyleMetadata = (content) => {
  if (!Array.isArray(content)) {
    return content;
  }

  let changed = false;
  const nextContent = content.map((item) => {
    if (!isPlainObject(item)) {
      return item;
    }

    const hasInlineTextStyle = Object.hasOwn(item, "textStyle");
    const hasTextStyleSegmentId = Object.hasOwn(item, "textStyleSegmentId");
    if (!hasInlineTextStyle && !hasTextStyleSegmentId) {
      return item;
    }

    const nextItem = { ...item };
    delete nextItem.textStyle;
    delete nextItem.textStyleSegmentId;

    changed = true;
    return nextItem;
  });

  return changed ? nextContent : content;
};

const sanitizeSceneDialogueContentInlineTextStyleMetadata = (
  repositoryState = {},
) => {
  const sceneItems = repositoryState.scenes?.items;
  if (!isPlainObject(sceneItems)) {
    return repositoryState;
  }

  let scenesChanged = false;
  const nextSceneItems = {};

  Object.entries(sceneItems).forEach(([sceneId, scene]) => {
    const sectionItems = scene?.sections?.items;
    if (!isPlainObject(sectionItems)) {
      nextSceneItems[sceneId] = scene;
      return;
    }

    let sectionsChanged = false;
    const nextSectionItems = {};

    Object.entries(sectionItems).forEach(([sectionId, section]) => {
      const lineItems = section?.lines?.items;
      if (!isPlainObject(lineItems)) {
        nextSectionItems[sectionId] = section;
        return;
      }

      let linesChanged = false;
      const nextLineItems = {};

      Object.entries(lineItems).forEach(([lineId, line]) => {
        const dialogue = line?.actions?.dialogue;
        const nextContent = sanitizeDialogueContentInlineTextStyleMetadata(
          dialogue?.content,
        );

        if (nextContent === dialogue?.content) {
          nextLineItems[lineId] = line;
          return;
        }

        nextLineItems[lineId] = {
          ...line,
          actions: {
            ...line.actions,
            dialogue: {
              ...dialogue,
              content: nextContent,
            },
          },
        };
        linesChanged = true;
      });

      if (!linesChanged) {
        nextSectionItems[sectionId] = section;
        return;
      }

      nextSectionItems[sectionId] = {
        ...section,
        lines: {
          ...section.lines,
          items: nextLineItems,
        },
      };
      sectionsChanged = true;
    });

    if (!sectionsChanged) {
      nextSceneItems[sceneId] = scene;
      return;
    }

    nextSceneItems[sceneId] = {
      ...scene,
      sections: {
        ...scene.sections,
        items: nextSectionItems,
      },
    };
    scenesChanged = true;
  });

  if (!scenesChanged) {
    return repositoryState;
  }

  return {
    ...repositoryState,
    scenes: {
      ...repositoryState.scenes,
      items: nextSceneItems,
    },
  };
};

const prepareProjectDataSourceStateForPreview = (repositoryState = {}) => {
  return sanitizeSceneDialogueContentInlineTextStyleMetadata(repositoryState);
};

const getDraftSectionKey = (sceneId, sectionId) => {
  if (!sceneId || !sectionId) {
    return undefined;
  }

  return String(sceneId) + ":" + String(sectionId);
};

const getDraftSections = (state) => {
  const draftSections = Object.values(state.draftSections || {}).filter(
    (draftSection) => draftSection?.sceneId && draftSection?.sectionId,
  );
  const legacyDraftSection = state.draftSection;
  if (!legacyDraftSection?.sceneId || !legacyDraftSection?.sectionId) {
    return draftSections;
  }

  const legacyKey = getDraftSectionKey(
    legacyDraftSection.sceneId,
    legacyDraftSection.sectionId,
  );
  const hasLegacyDraftSection = draftSections.some(
    (draftSection) =>
      getDraftSectionKey(draftSection.sceneId, draftSection.sectionId) ===
      legacyKey,
  );

  if (!hasLegacyDraftSection) {
    draftSections.push(legacyDraftSection);
  }

  return draftSections;
};

const getDraftSectionForSelection = (state, sceneId, sectionId) => {
  const draftSectionKey = getDraftSectionKey(sceneId, sectionId);
  if (!draftSectionKey) {
    return undefined;
  }

  return state.draftSections?.[draftSectionKey];
};

const overlayDraftSectionOnRepositoryState = (
  repositoryState,
  draftSection,
) => {
  if (!draftSection?.sceneId || !draftSection?.sectionId) {
    return repositoryState;
  }

  const repositoryScenes = repositoryState?.scenes;
  const repositoryScene = repositoryScenes?.items?.[draftSection.sceneId];
  const repositorySections = repositoryScene?.sections;
  const repositorySection = repositorySections?.items?.[draftSection.sectionId];

  if (!repositoryScene || !repositorySection) {
    return repositoryState;
  }

  const draftLines = cloneSceneEditorLines(draftSection.lines);
  const lineItems = {};

  for (const line of draftLines) {
    if (!line?.id) {
      continue;
    }

    lineItems[line.id] = {
      ...repositorySection.lines?.items?.[line.id],
      id: line.id,
      actions: structuredClone(line.actions || {}),
    };
  }

  return {
    ...repositoryState,
    scenes: {
      ...repositoryScenes,
      items: {
        ...repositoryScenes?.items,
        [draftSection.sceneId]: {
          ...repositoryScene,
          sections: {
            ...repositorySections,
            items: {
              ...repositorySections?.items,
              [draftSection.sectionId]: {
                ...repositorySection,
                initialLineId:
                  draftLines[0]?.id ?? repositorySection.initialLineId,
                lines: {
                  ...repositorySection.lines,
                  items: lineItems,
                  tree: toFlatTree(Object.keys(lineItems)),
                },
              },
            },
          },
        },
      },
    },
  };
};

const overlayDraftSectionsOnRepositoryState = (repositoryState, state) => {
  return getDraftSections(state).reduce(
    (nextRepositoryState, draftSection) =>
      overlayDraftSectionOnRepositoryState(nextRepositoryState, draftSection),
    repositoryState,
  );
};

const buildProjectDataSourceState = (state) => {
  const repositoryState = state.repositoryState || {};
  const domainState = state.domainState || {};
  const domainScenes = domainState.scenes || {};
  const domainSections = domainState.sections || {};
  const domainLines = domainState.lines || {};

  if (Object.keys(domainScenes).length === 0) {
    return overlayDraftSectionsOnRepositoryState(repositoryState, state);
  }

  const sceneIds = Object.keys(domainScenes);
  const sceneItems = {};

  for (const sceneId of sceneIds) {
    const scene = domainScenes[sceneId];
    const sectionIds = Array.isArray(scene?.sectionIds) ? scene.sectionIds : [];
    const sectionItems = {};

    for (const sectionId of sectionIds) {
      const section = domainSections[sectionId];
      if (!section) {
        continue;
      }

      const draftSection = getDraftSectionForSelection(
        state,
        sceneId,
        sectionId,
      );
      const draftLines = cloneSceneEditorLines(draftSection?.lines);
      const lineIds = draftSection
        ? draftLines.map((line) => line.id)
        : Array.isArray(section.lineIds)
          ? section.lineIds
          : [];
      const lineItems = {};

      for (const lineId of lineIds) {
        const line =
          draftLines.find((draftLine) => draftLine.id === lineId) ||
          domainLines[lineId];
        if (!line) {
          continue;
        }

        lineItems[lineId] = {
          id: lineId,
          actions: structuredClone(line.actions || {}),
        };
      }

      sectionItems[sectionId] = {
        id: sectionId,
        name: section.name || `Section ${sectionId}`,
        initialLineId: draftSection ? draftLines[0]?.id : section.initialLineId,
        lines: {
          items: lineItems,
          tree: toFlatTree(Object.keys(lineItems)),
        },
      };
    }

    sceneItems[sceneId] = {
      id: sceneId,
      type: scene?.type || "scene",
      name: scene?.name || `Scene ${sceneId}`,
      initialSectionId: scene?.initialSectionId,
      sections: {
        items: sectionItems,
        tree: toFlatTree(Object.keys(sectionItems)),
      },
    };
  }

  return {
    ...repositoryState,
    story: {
      ...repositoryState.story,
      initialSceneId:
        domainState.story?.initialSceneId ||
        repositoryState.story?.initialSceneId,
    },
    scenes: {
      ...repositoryState.scenes,
      items: sceneItems,
      tree: toFlatTree(sceneIds),
    },
  };
};

export const createInitialState = () => ({
  isTouchMode: false,
  mobileKeyboardState: {
    isVisible: false,
    bottom: 0,
    keyboardInset: 0,
    visualOffsetTop: 0,
    pageTop: 0,
    visualHeight: 0,
    layoutHeight: 0,
  },
  sceneId: undefined,
  selectedLineId: undefined,
  sectionsGraphView: false,
  selectedSectionId: "1",
  sectionsOverviewPanel: {
    isOpen: false,
  },
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    actionsType: null,
    lineId: undefined,
  },
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null,
    mode: null,
    defaultName: "",
  },
  sectionCreateDialog: {
    isOpen: false,
    formKey: 0,
    mode: "create",
    sectionId: undefined,
    placementPosition: undefined,
    placementTargetSectionId: undefined,
    defaultValues: {
      name: "",
      inheritPresentationFromSelectedLine: true,
    },
  },
  sectionMoveSceneDialog: {
    isOpen: false,
    formKey: 0,
    sectionId: undefined,
    defaultValues: {
      sceneId: undefined,
    },
  },
  sceneSettings: {
    showLineNumbers: true,
    fontSize: DEFAULT_SCENE_EDITOR_FONT_SIZE,
  },
  sceneSettingsDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      showLineNumbers: true,
      fontSize: DEFAULT_SCENE_EDITOR_FONT_SIZE,
      isMuted: false,
    },
  },
  repositoryState: {},
  repositoryRevision: 0,
  domainState: {},
  draftSection: undefined,
  draftSections: {},
  draftSaveTimerId: undefined,
  lastDraftFlushStartedAt: 0,
  draftSavePendingSinceAt: 0,
  draftFlushInFlight: false,
  previewVisible: false,
  previewSceneId: undefined,
  previewSectionId: undefined,
  previewLineId: undefined,
  skipNextEditorBlurDraftFlush: false,
  presentationState: {},
  temporaryPresentationState: {},
  backgroundTransformEditor: {
    isOpen: false,
    transform: normalizeBackgroundTransformEditorTransform(),
    dragStartPosition: undefined,
    selectedElementMetrics: undefined,
    background: {},
    targetType: "background",
    actionKey: "background",
    action: undefined,
    itemIndex: undefined,
    item: undefined,
    targetId: undefined,
    suppressNextActionsDialogClose: false,
  },
  sectionLineChanges: {},
  sectionLineChangesBySectionId: {},
  isMuted: false,
  isScenePageLoading: true,
  isSceneAssetLoading: false,
  lockingLineId: null, // Lock to prevent duplicate split/merge operations
  actionTargetLineId: undefined,
  deadEndTooltip: {
    open: false,
    x: 0,
    y: 0,
    content: "",
  },
});

export const setSceneId = ({ state }, { sceneId } = {}) => {
  state.sceneId = sceneId;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setMobileKeyboardState = (
  { state },
  {
    isVisible,
    bottom,
    keyboardInset,
    visualOffsetTop,
    pageTop,
    visualHeight,
    layoutHeight,
  } = {},
) => {
  state.mobileKeyboardState.isVisible = isVisible === true;
  state.mobileKeyboardState.bottom = Number.isFinite(bottom)
    ? Math.max(0, Math.round(bottom))
    : 0;
  state.mobileKeyboardState.keyboardInset = Number.isFinite(keyboardInset)
    ? Math.max(0, Math.round(keyboardInset))
    : 0;
  state.mobileKeyboardState.visualOffsetTop = Number.isFinite(visualOffsetTop)
    ? Math.max(0, Math.round(visualOffsetTop))
    : 0;
  state.mobileKeyboardState.pageTop = Number.isFinite(pageTop)
    ? Math.max(0, Math.round(pageTop))
    : 0;
  state.mobileKeyboardState.visualHeight = Number.isFinite(visualHeight)
    ? Math.max(0, Math.round(visualHeight))
    : 0;
  state.mobileKeyboardState.layoutHeight = Number.isFinite(layoutHeight)
    ? Math.max(0, Math.round(layoutHeight))
    : 0;
};

export const setRepositoryState = ({ state }, { repository } = {}) => {
  state.repositoryState = repository;
};

export const setRepositoryRevision = ({ state }, { revision } = {}) => {
  state.repositoryRevision = Number.isFinite(revision) ? revision : 0;
};

export const setDomainState = ({ state }, { domainState } = {}) => {
  state.domainState = domainState || {};
};

export const setDraftSection = ({ state }, { draftSection } = {}) => {
  if (!draftSection?.sceneId || !draftSection?.sectionId) {
    state.draftSection = draftSection;
    return;
  }

  if (!state.draftSections) {
    state.draftSections = {};
  }

  const draftSectionKey = getDraftSectionKey(
    draftSection.sceneId,
    draftSection.sectionId,
  );
  state.draftSections[draftSectionKey] = draftSection;

  if (
    draftSection.sceneId === state.sceneId &&
    draftSection.sectionId === state.selectedSectionId
  ) {
    state.draftSection = draftSection;
  }
};

export const clearDraftSection = ({ state }, _payload = {}) => {
  const draftSectionKey = getDraftSectionKey(
    state.sceneId,
    state.selectedSectionId,
  );
  if (draftSectionKey && state.draftSections) {
    delete state.draftSections[draftSectionKey];
  }
  state.draftSection = undefined;
};

export const setDraftSaveTimerId = ({ state }, { timerId } = {}) => {
  state.draftSaveTimerId = timerId;
};

export const clearDraftSaveTimer = ({ state }, _payload = {}) => {
  state.draftSaveTimerId = undefined;
};

export const setLastDraftFlushStartedAt = ({ state }, { timestamp } = {}) => {
  state.lastDraftFlushStartedAt = Number.isFinite(timestamp) ? timestamp : 0;
};

export const setDraftSavePendingSinceAt = ({ state }, { timestamp } = {}) => {
  state.draftSavePendingSinceAt = Number.isFinite(timestamp) ? timestamp : 0;
};

export const setDraftFlushInFlight = ({ state }, { value } = {}) => {
  state.draftFlushInFlight = value === true;
};

export const showPreviewSceneId = (
  { state },
  { sceneId, sectionId, lineId } = {},
) => {
  state.previewVisible = true;
  state.previewSceneId = sceneId;
  state.previewSectionId = sectionId;
  state.previewLineId = lineId;
};

export const hidePreviewScene = ({ state }, _payload = {}) => {
  state.previewVisible = false;
  state.previewSectionId = undefined;
  state.previewLineId = undefined;
};

export const setSkipNextEditorBlurDraftFlush = ({ state }, { value } = {}) => {
  state.skipNextEditorBlurDraftFlush = value === true;
};

export const selectSkipNextEditorBlurDraftFlush = ({ state }) => {
  return state.skipNextEditorBlurDraftFlush === true;
};

export const setPresentationState = ({ state }, { presentationState } = {}) => {
  state.presentationState = presentationState;
};

export const setTemporaryPresentationState = (
  { state },
  { presentationState } = {},
) => {
  state.temporaryPresentationState = toPlainObject(presentationState);
};

export const clearTemporaryPresentationState = ({ state }, _payload = {}) => {
  state.temporaryPresentationState = {};
};

export const selectTemporaryPresentationState = ({ state }) => {
  return toPlainObject(state.temporaryPresentationState);
};

export const selectEffectivePresentationState = ({ state }) => {
  return mergePresentationStates(
    state.presentationState,
    state.temporaryPresentationState,
  );
};

export const openBackgroundTransformEditor = (
  { state },
  {
    background,
    transform,
    targetType = "background",
    actionKey = "background",
    action,
    itemIndex,
    item,
    targetId,
  } = {},
) => {
  state.backgroundTransformEditor.isOpen = true;
  state.backgroundTransformEditor.background = toPlainObject(background);
  state.backgroundTransformEditor.targetType = targetType;
  state.backgroundTransformEditor.actionKey = actionKey;
  state.backgroundTransformEditor.action = action
    ? toPlainObject(action)
    : undefined;
  state.backgroundTransformEditor.itemIndex = itemIndex;
  state.backgroundTransformEditor.item = item ? toPlainObject(item) : undefined;
  state.backgroundTransformEditor.targetId = targetId;
  state.backgroundTransformEditor.transform =
    normalizeBackgroundTransformEditorTransform(transform);
  state.backgroundTransformEditor.dragStartPosition = undefined;
  state.backgroundTransformEditor.selectedElementMetrics = undefined;
};

export const closeBackgroundTransformEditor = ({ state }, _payload = {}) => {
  state.backgroundTransformEditor.isOpen = false;
  state.backgroundTransformEditor.dragStartPosition = undefined;
  state.backgroundTransformEditor.selectedElementMetrics = undefined;
};

export const setBackgroundTransformEditorSelectedElementMetrics = (
  { state },
  { metrics } = {},
) => {
  state.backgroundTransformEditor.selectedElementMetrics = metrics;
};

export const setBackgroundTransformEditorTransform = (
  { state },
  { transform } = {},
) => {
  state.backgroundTransformEditor.transform =
    normalizeBackgroundTransformEditorTransform(transform);
};

export const setBackgroundTransformEditorDragStartPosition = (
  { state },
  { dragStartPosition } = {},
) => {
  state.backgroundTransformEditor.dragStartPosition = dragStartPosition;
};

export const clearBackgroundTransformEditorDragStartPosition = (
  { state },
  _payload = {},
) => {
  state.backgroundTransformEditor.dragStartPosition = undefined;
};

export const suppressNextActionsDialogClose = ({ state }, _payload = {}) => {
  state.backgroundTransformEditor.suppressNextActionsDialogClose = true;
};

export const clearSuppressNextActionsDialogClose = (
  { state },
  _payload = {},
) => {
  state.backgroundTransformEditor.suppressNextActionsDialogClose = false;
};

export const selectSuppressNextActionsDialogClose = ({ state }) => {
  return (
    state.backgroundTransformEditor.suppressNextActionsDialogClose === true
  );
};

export const selectBackgroundTransformEditor = ({ state }) => {
  return state.backgroundTransformEditor;
};

export const selectIsBackgroundTransformEditorOpen = ({ state }) => {
  return state.backgroundTransformEditor.isOpen === true;
};

const syncPresentationStateFromSelectedLineChanges = (state) => {
  const syncedPresentationState = getSectionLinePresentationState(
    state,
    state.selectedLineId,
  );
  if (syncedPresentationState !== undefined) {
    state.presentationState = syncedPresentationState;
  }
};

export const setSectionLineChanges = ({ state }, { changes } = {}) => {
  state.sectionLineChanges = changes ?? {};
  if (state.selectedSectionId) {
    state.sectionLineChangesBySectionId[state.selectedSectionId] =
      state.sectionLineChanges;
  }
  syncPresentationStateFromSelectedLineChanges(state);
};

export const setSectionLineChangesBySectionId = (
  { state },
  { changesBySectionId } = {},
) => {
  state.sectionLineChangesBySectionId = toPlainObject(changesBySectionId);
  state.sectionLineChanges = state.selectedSectionId
    ? (state.sectionLineChangesBySectionId[state.selectedSectionId] ?? {})
    : {};
  syncPresentationStateFromSelectedLineChanges(state);
};

export const setScenePageLoading = ({ state }, { isLoading } = {}) => {
  state.isScenePageLoading = isLoading;
};

export const selectIsScenePageLoading = ({ state }) => {
  return state.isScenePageLoading;
};

export const setSceneAssetLoading = ({ state }, { isLoading } = {}) => {
  state.isSceneAssetLoading = isLoading;
};

export const selectIsSceneAssetLoading = ({ state }) => {
  return state.isSceneAssetLoading;
};

export const selectSectionLineChanges = ({ state }) => {
  return state.sectionLineChanges;
};

export const selectPreviewScene = ({ state }) => {
  return {
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
  };
};

// Repository selectors
export const selectRepositoryState = ({ state }) => {
  return state.repositoryState;
};

export const selectRepositoryRevision = ({ state }) => {
  return state.repositoryRevision;
};

export const selectDomainState = ({ state }) => {
  return state.domainState;
};

export const selectDraftSection = ({ state }) => {
  const draftSectionKey = getDraftSectionKey(
    state.sceneId,
    state.selectedSectionId,
  );
  return state.draftSections?.[draftSectionKey] ?? state.draftSection;
};

export const selectDraftSectionBySectionId = (
  { state },
  { sectionId } = {},
) => {
  const draftSectionKey = getDraftSectionKey(state.sceneId, sectionId);
  if (!draftSectionKey) {
    return undefined;
  }

  return state.draftSections?.[draftSectionKey];
};

export const selectPendingDraftSections = ({ state }) => {
  return getDraftSections(state).filter((draftSection) => draftSection?.dirty);
};

export const selectDraftSaveTimerId = ({ state }) => {
  return state.draftSaveTimerId;
};

export const selectLastDraftFlushStartedAt = ({ state }) => {
  return state.lastDraftFlushStartedAt;
};

export const selectDraftSavePendingSinceAt = ({ state }) => {
  return state.draftSavePendingSinceAt;
};

export const selectDraftFlushInFlight = ({ state }) => {
  return state.draftFlushInFlight === true;
};

export const selectCharacters = ({ state }) => {
  const characters = state.repositoryState.characters?.items || {};
  const processedCharacters = {};

  Object.keys(characters).forEach((characterId) => {
    const character = characters[characterId];
    if (character.type === "character") {
      processedCharacters[characterId] = {
        name: character.name,
        variables: {
          name: character.name || "Unnamed Character",
        },
        sprites: {},
      };
      if (character.nameVariableId) {
        processedCharacters[characterId].nameVariableId =
          character.nameVariableId;
      }

      // Process sprite parts if they exist
      if (character.sprites && character.sprites.items) {
        Object.keys(character.sprites.items).forEach((spriteId) => {
          const sprite = character.sprites.items[spriteId];
          if (sprite.fileId) {
            processedCharacters[characterId].sprites[spriteId] = {
              fileId: sprite.fileId,
            };
          }
        });
      }
    }
  });

  return processedCharacters;
};

export const selectLayouts = ({ state }) => {
  const layouts = state.repositoryState.layouts?.items || {};
  const images = state.repositoryState.images?.items || {};
  const textStylesData = state.repositoryState.textStyles || {
    items: {},
    tree: [],
  };
  const colors = state.repositoryState.colors || { items: {}, tree: [] };
  const fonts = state.repositoryState.fonts || { items: {}, tree: [] };
  const files = state.repositoryState.files || { items: {}, tree: [] };
  const processedLayouts = {};

  Object.keys(layouts).forEach((layoutId) => {
    const layout = layouts[layoutId];
    if (layout.type === "layout") {
      processedLayouts[layoutId] = {
        id: layoutId,
        name: layout.name,
        layoutType: layout.layoutType,
        isFragment: isFragmentLayout(layout),
        elements: buildLayoutElements(
          toHierarchyStructure(layout.elements),
          images,
          textStylesData,
          colors,
          fonts,
          {
            layoutId,
            layoutType: layout.layoutType,
            layoutSchemaVersion: layout.layoutSchemaVersion,
            filesData: files,
            layoutsData: layouts,
          },
        ).elements,
      };
    }
  });

  return processedLayouts;
};

const buildSceneFromDomainState = ({ state }) => {
  if (!state.sceneId) {
    return null;
  }

  const domainState = selectDomainState({ state });
  const scene = domainState?.scenes?.[state.sceneId];
  if (!scene) {
    return null;
  }

  const sectionsById = domainState?.sections || {};
  const linesById = domainState?.lines || {};

  const sections = (scene.sectionIds || [])
    .map((sectionId) => sectionsById[sectionId])
    .filter((section) => !!section)
    .map((section) => ({
      ...section,
      lines: (section.lineIds || [])
        .map((lineId) => linesById[lineId])
        .filter((line) => !!line),
    }));

  const repositoryInitialSectionId =
    state.repositoryState?.scenes?.items?.[state.sceneId]?.initialSectionId;

  return {
    ...scene,
    initialSectionId:
      scene.initialSectionId || repositoryInitialSectionId || sections[0]?.id,
    sections,
  };
};

const buildSceneFromRepositoryState = ({ state }) => {
  if (!state.sceneId) {
    return null;
  }

  const repositoryScene = state.repositoryState?.scenes?.items?.[state.sceneId];
  if (!repositoryScene || repositoryScene.type !== "scene") {
    return null;
  }

  const sectionItems = repositoryScene.sections?.items || {};
  const orderedSectionIds = getOrderedIdsFromHierarchy(
    repositoryScene.sections?.tree,
    Object.keys(sectionItems),
  );

  const sections = orderedSectionIds
    .map((sectionId) => ({
      id: sectionId,
      ...sectionItems[sectionId],
    }))
    .filter((section) => !!section?.id && section.type !== "folder")
    .map((section) => {
      const lineItems = section.lines?.items || {};
      const orderedLineIds = getOrderedIdsFromHierarchy(
        section.lines?.tree,
        Object.keys(lineItems),
      );

      return {
        ...section,
        lines: orderedLineIds
          .map((lineId) => ({
            id: lineId,
            ...lineItems[lineId],
          }))
          .filter((line) => !!line?.id),
      };
    });

  return {
    id: state.sceneId,
    ...repositoryScene,
    sections,
  };
};

export const selectCommittedScene = ({ state }) => {
  const domainScene = buildSceneFromDomainState({ state });
  if (domainScene) {
    return domainScene;
  }

  return buildSceneFromRepositoryState({ state });
};

export const selectScene = ({ state }) => {
  const baseScene = selectCommittedScene({ state });
  return overlaySceneWithDraftSections(baseScene, getDraftSections(state));
};

export const selectSceneId = ({ state }) => {
  return state.sceneId;
};

export const selectSelectedSectionId = ({ state }) => {
  return state.selectedSectionId;
};

export const selectSelectedLineId = ({ state }) => {
  return state.selectedLineId;
};

export const setSelectedLineId = ({ state }, { selectedLineId } = {}) => {
  const selectionChanged = state.selectedLineId !== selectedLineId;
  const syncedPresentationState = getSectionLinePresentationState(
    state,
    selectedLineId,
  );
  state.selectedLineId = selectedLineId;
  if (selectionChanged) {
    state.temporaryPresentationState = {};
  }
  if (!selectedLineId) {
    state.presentationState = {};
    return;
  }

  if (syncedPresentationState !== undefined) {
    state.presentationState = syncedPresentationState;
  }
};

export const selectActionTargetLineId = ({ state }) => {
  return state.actionTargetLineId;
};

export const setActionTargetLineId = ({ state }, { lineId } = {}) => {
  state.actionTargetLineId = lineId;
};

export const clearActionTargetLineId = ({ state }, _payload = {}) => {
  state.actionTargetLineId = undefined;
};

export const setSelectedSectionId = ({ state }, { selectedSectionId } = {}) => {
  state.selectedSectionId = selectedSectionId;
};

export const openSectionsOverviewPanel = ({ state }, _payload = {}) => {
  state.sectionsOverviewPanel.isOpen = true;
  state.deadEndTooltip.open = false;
};

export const closeSectionsOverviewPanel = ({ state }, _payload = {}) => {
  state.sectionsOverviewPanel.isOpen = false;
  state.deadEndTooltip.open = false;
};

export const selectIsSectionsOverviewOpen = ({ state }) => {
  return state.sectionsOverviewPanel.isOpen;
};

// Set lock to prevent duplicate split/merge operations on the same line
export const setLockingLineId = ({ state }, { lineId } = {}) => {
  state.lockingLineId = lineId;
};

// Clear lock after split/merge operation completes
export const clearLockingLineId = ({ state }, _payload = {}) => {
  state.lockingLineId = null;
};

// Get current locked line ID
export const selectLockingLineId = ({ state }) => {
  return state.lockingLineId;
};

export const selectDropdownMenu = ({ state }) => {
  return state.dropdownMenu;
};

export const selectPopover = ({ state }) => {
  return state.popover;
};

export const selectSectionCreateDialog = ({ state }) => {
  return state.sectionCreateDialog;
};

export const selectSectionMoveSceneDialog = ({ state }) => {
  return state.sectionMoveSceneDialog;
};

export const showSectionDropdownMenu = (
  { state },
  { position, sectionId } = {},
) => {
  const scene = selectCommittedScene({ state });
  const sceneOptions = buildMoveSectionSceneOptions(
    state.repositoryState,
    state.sceneId,
  );
  const sections = Array.isArray(scene?.sections) ? scene.sections : [];
  const sectionIndex = sections.findIndex(
    (section) => section.id === sectionId,
  );
  const hasPreviousSection = sectionIndex > 0;
  const hasNextSection =
    sectionIndex >= 0 && sectionIndex < sections.length - 1;
  const items = [
    { label: "Add section above", type: "item", value: "add-section-above" },
    { label: "Add section below", type: "item", value: "add-section-below" },
  ];

  if (hasPreviousSection) {
    items.push({ label: "Move up", type: "item", value: "move-section-up" });
  }

  if (hasNextSection) {
    items.push({
      label: "Move down",
      type: "item",
      value: "move-section-down",
    });
  }

  items.push(
    { label: "Edit", type: "item", value: "edit-section" },
    { label: "Duplicate", type: "item", value: "duplicate-section" },
  );

  if (
    sceneOptions.length > 0 &&
    scene &&
    scene.sections &&
    scene.sections.length > 1
  ) {
    items.push({
      label: "Move to scene",
      type: "item",
      value: "move-section-scene",
    });
  }

  // Only show delete option if there's more than 1 section
  if (scene && scene.sections && scene.sections.length > 1) {
    items.push({ label: "Delete", type: "item", value: "delete-section" });
  }

  state.dropdownMenu = {
    isOpen: true,
    position,
    items,
    sectionId,
    actionsType: null,
    lineId: undefined,
  };
};

export const showSectionsOverviewDropdownMenu = (
  { state },
  { position } = {},
) => {
  const scene = selectScene({ state });
  const items = (scene?.sections || []).map((section, index) => ({
    label: `${index + 1}. ${section.name || `Section ${index + 1}`}`,
    type: "item",
    value: `go-to-section:${section.id}`,
  }));

  state.dropdownMenu = {
    isOpen: true,
    position,
    items,
    sectionId: null,
    actionsType: null,
    lineId: undefined,
  };
};

export const showActionsDropdownMenu = (
  { state },
  { position, actionsType } = {},
) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [{ label: "Delete", type: "item", value: "delete-actions" }],
    sectionId: null,
    actionsType,
    lineId: undefined,
  };
};

export const showLineDropdownMenu = ({ state }, { position, lineId } = {}) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [{ label: "Delete", type: "item", value: "delete-line" }],
    sectionId: null,
    actionsType: null,
    lineId,
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    actionsType: null,
    lineId: undefined,
  };
};

export const showPopover = (
  { state },
  { position, sectionId, mode, defaultName } = {},
) => {
  state.popover = {
    isOpen: true,
    position,
    sectionId,
    mode: mode || "rename-section",
    defaultName: defaultName || "",
  };
};

export const hidePopover = ({ state }, _payload = {}) => {
  state.popover = {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null,
    mode: null,
    defaultName: "",
  };
};

export const showSectionCreateDialog = (
  { state },
  { defaultName, placementPosition, placementTargetSectionId } = {},
) => {
  state.sectionCreateDialog = {
    isOpen: true,
    formKey: (state.sectionCreateDialog?.formKey || 0) + 1,
    mode: "create",
    sectionId: undefined,
    placementPosition,
    placementTargetSectionId,
    defaultValues: {
      name: defaultName || "",
      inheritPresentationFromSelectedLine: true,
    },
  };
};

export const showSectionEditDialog = ({ state }, { sectionId } = {}) => {
  const scene = selectCommittedScene({ state });
  const section = scene?.sections?.find((section) => section.id === sectionId);

  state.sectionCreateDialog = {
    isOpen: true,
    formKey: (state.sectionCreateDialog?.formKey || 0) + 1,
    mode: "edit",
    sectionId,
    placementPosition: undefined,
    placementTargetSectionId: undefined,
    defaultValues: {
      name: section?.name || "",
    },
  };
};

export const hideSectionCreateDialog = ({ state }, _payload = {}) => {
  state.sectionCreateDialog = {
    ...state.sectionCreateDialog,
    isOpen: false,
    sectionId: undefined,
    placementPosition: undefined,
    placementTargetSectionId: undefined,
  };
};

export const showSectionMoveSceneDialog = ({ state }, { sectionId } = {}) => {
  state.sectionMoveSceneDialog = {
    isOpen: true,
    formKey: (state.sectionMoveSceneDialog?.formKey || 0) + 1,
    sectionId,
    defaultValues: {
      sceneId: undefined,
    },
  };
};

export const hideSectionMoveSceneDialog = ({ state }, _payload = {}) => {
  state.sectionMoveSceneDialog.isOpen = false;
  state.sectionMoveSceneDialog.sectionId = undefined;
};

export const showSceneSettingsDialog = ({ state }, _payload = {}) => {
  state.sceneSettingsDialog.isOpen = true;
  state.sceneSettingsDialog.formKey += 1;
  state.sceneSettingsDialog.defaultValues = {
    showLineNumbers: state.sceneSettings.showLineNumbers,
    fontSize: normalizeSceneEditorFontSize(state.sceneSettings.fontSize),
    isMuted: state.isMuted,
  };
};

export const hideSceneSettingsDialog = ({ state }, _payload = {}) => {
  state.sceneSettingsDialog.isOpen = false;
};

export const setSceneSettings = (
  { state },
  { showLineNumbers, isMuted, fontSize } = {},
) => {
  state.sceneSettings.showLineNumbers =
    showLineNumbers ?? state.sceneSettings.showLineNumbers;
  state.sceneSettings.fontSize = normalizeSceneEditorFontSize(
    fontSize ?? state.sceneSettings.fontSize,
  );
  state.isMuted = isMuted ?? state.isMuted;
};

export const selectProjectData = ({ state }) => {
  return constructProjectData(
    prepareProjectDataSourceStateForPreview(buildProjectDataSourceState(state)),
  );
};

const selectCanvasAspectRatio = ({ state }) => {
  const projectResolution = state.repositoryState?.project?.resolution
    ? requireProjectResolution(
        state.repositoryState.project.resolution,
        "Project resolution",
      )
    : DEFAULT_PROJECT_RESOLUTION;

  return formatProjectResolutionAspectRatio(projectResolution);
};

const selectCanvasAspectRatioWidthMultiplier = ({ state }) => {
  const projectResolution = state.repositoryState?.project?.resolution
    ? requireProjectResolution(
        state.repositoryState.project.resolution,
        "Project resolution",
      )
    : DEFAULT_PROJECT_RESOLUTION;
  const width = Number(projectResolution.width);
  const height = Number(projectResolution.height);
  const ratio = width / height;

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
};

const selectPreviewCanvasMaxWidth = ({ state }) => {
  const widthMultiplier = selectCanvasAspectRatioWidthMultiplier({ state });
  const maxWidthVh = Number((widthMultiplier * 50).toFixed(4));

  return `min(100%, ${maxWidthVh}vh)`;
};

const selectMobilePreviewCanvasMaxWidth = ({ state }) => {
  const defaultMaxWidth = selectPreviewCanvasMaxWidth({ state });
  if (!state.isTouchMode || !state.mobileKeyboardState?.isVisible) {
    return defaultMaxWidth;
  }

  const visualHeight = Number(state.mobileKeyboardState.visualHeight);
  if (!Number.isFinite(visualHeight) || visualHeight <= 0) {
    return defaultMaxWidth;
  }

  const widthMultiplier = selectCanvasAspectRatioWidthMultiplier({ state });
  const reservedHeight =
    MOBILE_KEYBOARD_TOOLBAR_HEIGHT_PX + MOBILE_PREVIEW_VERTICAL_PADDING_PX;
  const availableCanvasHeight = Math.max(
    MOBILE_PREVIEW_MIN_HEIGHT_PX,
    visualHeight - reservedHeight,
  );
  const maxWidthPx = Number(
    (availableCanvasHeight * widthMultiplier).toFixed(4),
  );

  return `min(100%, ${maxWidthPx}px)`;
};

const selectMobileEditorBottomSpacerHeight = ({ state }) => {
  if (!state.isTouchMode || !state.mobileKeyboardState?.isVisible) {
    return "30vh";
  }

  const keyboardInset = Math.max(
    0,
    Number(state.mobileKeyboardState.keyboardInset) || 0,
  );
  const visualHeight = Math.max(
    0,
    Number(state.mobileKeyboardState.visualHeight) || 0,
  );
  const scrollRoom = Math.max(260, Math.round(visualHeight * 0.9));

  return `${keyboardInset + MOBILE_KEYBOARD_TOOLBAR_HEIGHT_PX + scrollRoom}px`;
};

const selectSystemActionsDialogPanelWidth = ({ state }) => {
  return state.backgroundTransformEditor.isOpen === true
    ? "calc(100vw - 64px)"
    : "calc((100vw - 64px) / 2)";
};
const selectBackgroundTransformEditorViewData = ({ state }) => {
  const editor = state.backgroundTransformEditor;
  const transform = normalizeBackgroundTransformEditorTransform(
    editor.transform,
  );
  const widthMultiplier = selectCanvasAspectRatioWidthMultiplier({ state });

  return {
    isOpen: editor.isOpen === true,
    transform,
    previewMaxWidth: `min(100vw, calc((100vh - 122px) * ${widthMultiplier}))`,
    canvasAspectRatio: selectCanvasAspectRatio({ state }),
    suppressNextActionsDialogClose:
      editor.suppressNextActionsDialogClose === true,
    suppressActionsDialogClose:
      editor.isOpen === true || editor.suppressNextActionsDialogClose === true,
    metrics: {
      x: formatBackgroundTransformEditorMetric(transform.x),
      y: formatBackgroundTransformEditorMetric(transform.y),
      scaleX: formatBackgroundTransformEditorMetric(transform.scaleX),
      scaleY: formatBackgroundTransformEditorMetric(transform.scaleY),
      rotation: formatBackgroundTransformEditorMetric(transform.rotation),
    },
  };
};

export const selectViewData = ({ state }) => {
  const scene = selectScene({ state });
  if (!scene) {
    return {
      scene: { id: "", name: "Scene", sections: [] },
      sections: [],
      sectionsOverviewOpen: false,
      sectionsOverviewItems: [],
      documentEditorLines: [],
      documentLineDecorations: [],
      sectionEditorItems: [],
      textStyles: [],
      mentionTargets: [],
      currentLine: null,
      actionsData: [],
      presentationState: selectEffectivePresentationState({ state }),
      dropdownMenu: state.dropdownMenu,
      popover: state.popover,
      selectedLineId: state.selectedLineId,
      sectionsGraphView: state.sectionsGraphView,
      layouts: [],
      allCharacters: [],
      form: { fields: [], actions: { buttons: [] } },
      selectedLine: null,
      selectedLineActions: {},
      sectionsGraph: JSON.stringify(
        { nodes: [], edges: [], adjacencyList: {} },
        null,
        2,
      ),
      previewVisible: state.previewVisible,
      previewSceneId: state.previewSceneId,
      previewSectionId: state.previewSectionId,
      previewLineId: state.previewLineId,
      canvasAspectRatio: selectCanvasAspectRatio({ state }),
      previewCanvasMaxWidth: selectPreviewCanvasMaxWidth({ state }),
      mobilePreviewCanvasMaxWidth: selectMobilePreviewCanvasMaxWidth({ state }),
      mobileEditorBottomSpacerHeight: selectMobileEditorBottomSpacerHeight({
        state,
      }),
      systemActionsDialogPanelWidth: selectSystemActionsDialogPanelWidth({
        state,
      }),
      sectionLineChanges: state.sectionLineChanges,
      sectionCreateDialog: state.sectionCreateDialog,
      sectionCreateForm: { fields: [], actions: { buttons: [] } },
      sectionMoveSceneDialog: state.sectionMoveSceneDialog,
      sectionMoveSceneForm: { fields: [], actions: { buttons: [] } },
      sceneSettings: state.sceneSettings,
      linesEditorKey: `document-${state.sceneSettings.showLineNumbers ? "line-numbers-show" : "line-numbers-hide"}`,
      sceneSettingsDialog: state.sceneSettingsDialog,
      sceneSettingsForm: { fields: [], actions: { buttons: [] } },
      isScenePageLoading: state.isScenePageLoading,
      isSceneAssetLoading: state.isSceneAssetLoading,
      deadEndTooltip: state.deadEndTooltip,
      backgroundTransformEditor: selectBackgroundTransformEditorViewData({
        state,
      }),
      isTouchMode: state.isTouchMode,
    };
  }

  const repositoryState = selectRepositoryState({ state });
  const layouts = repositoryState.layouts || { items: {} };
  const controls = repositoryState.controls || { items: {} };
  const textStyles = buildTextStyleOptions(repositoryState);
  const mentionTargets = buildMentionTargetOptions(repositoryState);
  const selectedSceneFirstSectionId = scene.sections?.[0]?.id;
  const selectedSceneInitialSectionId =
    scene.initialSectionId || selectedSceneFirstSectionId;
  const menuSceneId = repositoryState.story?.initialSceneId;

  const sectionPresentationById = Object.fromEntries(
    scene.sections.map((section) => [
      section.id,
      getSectionPresentation({
        section,
        initialSectionId: selectedSceneInitialSectionId,
        layouts,
        controls,
        menuSceneId,
      }),
    ]),
  );

  const sectionTransitionsDAG = selectSectionTransitionsDAG({ state });

  const sections = scene.sections.map((section) => {
    return {
      ...section,
      bgc: section.id === state.selectedSectionId ? "" : "mu",
      isDeadEnd: !!sectionPresentationById[section.id]?.isDeadEnd,
    };
  });
  const sectionsOverviewItems = scene.sections.map((section, index) => ({
    id: section.id,
    name: section.name || `Section ${index + 1}`,
    isSelected: section.id === state.selectedSectionId,
    rowBgc: "mu",
    rowBc: "mu",
    rowTextColor: "fg",
    isDeadEnd: !!sectionPresentationById[section.id]?.isDeadEnd,
  }));

  const popoverMode = state.popover.mode;
  const isCreateSectionPopover = popoverMode === "create-section";
  const popoverSectionId = state.popover.sectionId || state.selectedSectionId;
  const formTargetSection = scene.sections.find(
    (section) => section.id === popoverSectionId,
  );

  const sectionForm =
    isCreateSectionPopover || formTargetSection
      ? {
          fields: [
            {
              name: "name",
              type: "input-text",
              label: "Section Name",
              value: isCreateSectionPopover
                ? state.popover.defaultName || ""
                : formTargetSection?.name || "",
              required: true,
            },
          ],
          actions: {
            layout: "",
            buttons: [
              {
                id: "submit",
                variant: "pr",
                label: isCreateSectionPopover ? "Create" : "Rename",
              },
            ],
          },
        }
      : { fields: [], actions: { buttons: [] } };

  // Get current section for lines/actions panel
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );

  const selectedLine = currentSection?.lines?.find(
    (line) => line.id === state.selectedLineId,
  );
  const documentEditorLines = Array.isArray(currentSection?.lines)
    ? currentSection.lines
    : [];
  const documentLineDecorations = buildSceneDocumentLineDecorations({
    lines: documentEditorLines,
    repositoryState,
    sectionLineChanges: getSectionLineChangesForSection(
      state,
      currentSection?.id,
    ),
  });
  const sectionEditorItems = sections.map((section, index) => {
    const sectionLines = Array.isArray(section.lines) ? section.lines : [];
    const sectionLineChanges = getSectionLineChangesForSection(
      state,
      section.id,
    );

    return {
      ...section,
      index,
      name: section.name || `Section ${index + 1}`,
      isSelected: section.id === state.selectedSectionId,
      selectionActive: section.id === state.selectedSectionId,
      selectedLineId:
        section.id === state.selectedSectionId
          ? (state.selectedLineId ?? INACTIVE_SECTION_EDITOR_SELECTED_LINE_ID)
          : INACTIVE_SECTION_EDITOR_SELECTED_LINE_ID,
      editorKey: `document-${section.id}-${state.sceneSettings.showLineNumbers ? "line-numbers-show" : "line-numbers-hide"}`,
      documentEditorLines: sectionLines,
      documentLineDecorations: buildSceneDocumentLineDecorations({
        lines: sectionLines,
        repositoryState,
        sectionLineChanges,
      }),
    };
  });

  const isEditingSection = state.sectionCreateDialog.mode === "edit";
  const moveSectionSceneOptions = buildMoveSectionSceneOptions(
    repositoryState,
    state.sceneId,
  );
  const sectionCreateFields = [
    {
      name: "name",
      type: "input-text",
      label: "Section Name",
      required: true,
    },
  ];

  if (!isEditingSection) {
    sectionCreateFields.push({
      name: "inheritPresentationFromSelectedLine",
      type: "segmented-control",
      label: "Inherit state from selected line",
      required: true,
      clearable: false,
      options: [
        { value: false, label: "Don't Inherit" },
        { value: true, label: "Inherit" },
      ],
    });
  }

  const sectionCreateForm = {
    title: isEditingSection ? "Edit Section" : "Create Section",
    fields: sectionCreateFields,
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: isEditingSection ? "Save" : "Create",
        },
      ],
    },
  };

  const sectionMoveSceneForm = {
    title: "Move Section",
    fields: [
      {
        name: "sceneId",
        type: "select",
        label: "Scene",
        required: true,
        options: moveSectionSceneOptions,
      },
    ],
    actions: {
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Move",
          type: "submit",
          validate: true,
        },
      ],
    },
  };

  const sceneSettingsForm = {
    title: "Settings",
    fields: [
      {
        name: "showLineNumbers",
        type: "segmented-control",
        label: "Show line numbers",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "Hide" },
          { value: true, label: "Show" },
        ],
      },
      {
        name: "fontSize",
        type: "select",
        label: "Text size",
        required: true,
        clearable: false,
        options: SCENE_EDITOR_FONT_SIZE_OPTIONS,
      },
      {
        name: "isMuted",
        type: "segmented-control",
        label: "Preview audio",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "On" },
          { value: true, label: "Muted" },
        ],
      },
    ],
    actions: {
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "save",
          variant: "pr",
          label: "Save",
          type: "submit",
          validate: true,
        },
      ],
    },
  };

  return {
    scene: scene,
    sections,
    sectionsOverviewOpen: state.sectionsOverviewPanel.isOpen,
    sectionsOverviewItems,
    documentEditorLines,
    sectionEditorItems,
    textStyles,
    mentionTargets,
    documentLineDecorations,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: sectionForm,
    selectedLineId: state.selectedLineId,
    selectedLine,
    selectedLineActions: toPlainObject(selectedLine?.actions),
    sectionsGraphView: state.sectionsGraphView,
    layouts: Object.entries(selectLayouts({ state })).map(([id, item]) => ({
      id,
      ...item,
    })),
    allCharacters: Object.entries(repositoryState.characters?.items || {}).map(
      ([id, item]) => ({
        id,
        ...item,
      }),
    ),
    sectionsGraph: JSON.stringify(sectionTransitionsDAG, null, 2),
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
    previewSectionId: state.previewSectionId,
    previewLineId: state.previewLineId,
    canvasAspectRatio: selectCanvasAspectRatio({ state }),
    previewCanvasMaxWidth: selectPreviewCanvasMaxWidth({ state }),
    mobilePreviewCanvasMaxWidth: selectMobilePreviewCanvasMaxWidth({ state }),
    mobileEditorBottomSpacerHeight: selectMobileEditorBottomSpacerHeight({
      state,
    }),
    systemActionsDialogPanelWidth: selectSystemActionsDialogPanelWidth({
      state,
    }),
    presentationState: selectEffectivePresentationState({ state }),
    sectionLineChanges: state.sectionLineChanges,
    sectionCreateDialog: state.sectionCreateDialog,
    sectionCreateForm,
    sectionMoveSceneDialog: state.sectionMoveSceneDialog,
    sectionMoveSceneForm,
    sceneSettings: state.sceneSettings,
    linesEditorKey: `document-${state.sceneSettings.showLineNumbers ? "line-numbers-show" : "line-numbers-hide"}`,
    sceneSettingsDialog: state.sceneSettingsDialog,
    sceneSettingsForm,
    isScenePageLoading: state.isScenePageLoading,
    isSceneAssetLoading: state.isSceneAssetLoading,
    deadEndTooltip: state.deadEndTooltip,
    backgroundTransformEditor: selectBackgroundTransformEditorViewData({
      state,
    }),
    isTouchMode: state.isTouchMode,
  };
};

export const selectPreviousLineId = ({ state }, payload) => {
  const { lineId } = payload;
  const scene = selectScene({ state });
  if (!scene) return lineId;

  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );
  const currentLines = Array.isArray(currentSection?.lines)
    ? currentSection.lines
    : [];
  const lineIndex = currentLines.findIndex((line) => line.id === lineId);
  if (lineIndex === 0) {
    return lineId;
  }
  return currentLines[lineIndex - 1]?.id;
};

export const selectNextLineId = ({ state }, payload) => {
  const { lineId } = payload;
  const scene = selectScene({ state });
  if (!scene) return lineId;

  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );
  const currentLines = Array.isArray(currentSection?.lines)
    ? currentSection.lines
    : [];
  const lineIndex = currentLines.findIndex((line) => line.id === lineId);
  if (lineIndex >= currentLines.length - 1) {
    return lineId;
  }
  return currentLines[lineIndex + 1]?.id;
};

export const selectSelectedLine = ({ state }) => {
  const scene = selectScene({ state });
  if (!scene) return null;

  return scene.sections
    .find((section) => section.id === state.selectedSectionId)
    ?.lines.find((line) => line.id === state.selectedLineId);
};

export const toggleSectionsGraphView = ({ state }, _payload = {}) => {
  state.sectionsGraphView = !state.sectionsGraphView;
};

export const selectSectionTransitionsDAG = ({ state }) => {
  const currentScene = selectScene({ state });

  if (!currentScene) {
    return { nodes: [], edges: [], adjacencyList: {} };
  }

  const nodes = [];
  const edges = [];

  // Add all sections from current scene as nodes
  currentScene.sections.forEach((section) => {
    nodes.push({
      id: section.id,
      sceneId: currentScene.id,
      sceneName: currentScene.name,
      sectionName: section.name,
      type: "section",
    });

    // Check all lines in this section for section transitions within current scene
    if (section.lines) {
      section.lines.forEach((line) => {
        collectActionTargetSectionIds(line.actions).forEach((sectionId) => {
          // Only include transitions to other sections within the same scene
          const targetSection = currentScene.sections.find(
            (s) => s.id === sectionId,
          );

          if (targetSection) {
            edges.push({
              from: section.id,
              to: sectionId,
              type: "section",
              lineId: line.id,
            });
          }
        });
      });
    }
  });

  // Create adjacency list for easier graph traversal
  const adjacencyList = {};
  nodes.forEach((node) => {
    adjacencyList[node.id] = {
      node,
      outgoing: edges.filter((edge) => edge.from === node.id),
      incoming: edges.filter((edge) => edge.to === node.id),
    };
  });

  return {
    nodes,
    edges,
    adjacencyList,
  };
};

export const selectIsMuted = ({ state }) => {
  return state.isMuted;
};

export const showDeadEndTooltip = ({ state }, { x, y, content } = {}) => {
  state.deadEndTooltip = {
    open: true,
    x,
    y,
    content,
  };
};

export const hideDeadEndTooltip = ({ state }, _payload = {}) => {
  state.deadEndTooltip = {
    ...state.deadEndTooltip,
    open: false,
  };
};
