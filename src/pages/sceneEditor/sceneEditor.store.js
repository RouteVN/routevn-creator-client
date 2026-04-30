import {
  buildLayoutElements,
  isFragmentLayout,
} from "../../internal/project/layout.js";
import { toHierarchyStructure } from "../../internal/project/tree.js";
import { buildSceneEditorLineViewModels } from "../../internal/ui/sceneEditor/lineViewModels.js";
import { overlaySceneWithEditorSession } from "../../internal/ui/sceneEditor/editorSession.js";
import {
  constructProjectData,
  getSectionPresentation,
} from "../../internal/project/projection.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

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

const collectActionTargetSectionIds = (actions) => {
  const sectionIds = new Set();

  const scanActionValue = (value, key) => {
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

const getEditorSessionForSection = (state, sceneId, sectionId) => {
  const session = state.editorSession;
  if (!session) {
    return undefined;
  }

  if (session.sceneId !== sceneId || session.sectionId !== sectionId) {
    return undefined;
  }

  return session;
};

const getEditorSessionLines = (session) => {
  return (session?.lineOrder || [])
    .map((lineId) => session?.linesById?.[lineId]?.line)
    .filter(Boolean);
};

const overlayEditorSessionOnRepositoryState = (repositoryState, state) => {
  const session = state.editorSession;
  if (!session?.sceneId || !session?.sectionId) {
    return repositoryState;
  }

  const repositoryScenes = repositoryState?.scenes;
  const repositoryScene = repositoryScenes?.items?.[session.sceneId];
  const repositorySections = repositoryScene?.sections;
  const repositorySection = repositorySections?.items?.[session.sectionId];

  if (!repositoryScene || !repositorySection) {
    return repositoryState;
  }

  const sessionLines = getEditorSessionLines(session);
  const lineItems = {};

  for (const line of sessionLines) {
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
        [session.sceneId]: {
          ...repositoryScene,
          sections: {
            ...repositorySections,
            items: {
              ...repositorySections?.items,
              [session.sectionId]: {
                ...repositorySection,
                initialLineId:
                  sessionLines[0]?.id ?? repositorySection.initialLineId,
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

const buildProjectDataSourceState = (state) => {
  const repositoryState = state.repositoryState || {};
  const domainState = state.domainState || {};
  const domainScenes = domainState.scenes || {};
  const domainSections = domainState.sections || {};
  const domainLines = domainState.lines || {};

  if (Object.keys(domainScenes).length === 0) {
    return overlayEditorSessionOnRepositoryState(repositoryState, state);
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

      const editorSession = getEditorSessionForSection(
        state,
        sceneId,
        sectionId,
      );
      const sessionLines = getEditorSessionLines(editorSession);
      const lineIds = editorSession
        ? sessionLines.map((line) => line.id)
        : Array.isArray(section.lineIds)
          ? section.lineIds
          : [];
      const lineItems = {};

      for (const lineId of lineIds) {
        const line =
          sessionLines.find((sessionLine) => sessionLine.id === lineId) ||
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
        initialLineId: editorSession
          ? sessionLines[0]?.id
          : section.initialLineId,
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
  sceneId: undefined,
  selectedLineId: undefined,
  isTouchMode: false,
  mobileKeyboardVisible: false,
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
    defaultValues: {
      name: "",
      inheritPresentationFromSelectedLine: true,
    },
  },
  sceneSettings: {
    showLineNumbers: true,
  },
  sceneSettingsDialog: {
    isOpen: false,
    formKey: 0,
    defaultValues: {
      showLineNumbers: true,
      isMuted: false,
    },
  },
  repositoryState: {},
  repositoryRevision: 0,
  domainState: {},
  editorSession: undefined,
  draftSaveTimerId: undefined,
  lastDraftFlushStartedAt: 0,
  draftSavePendingSinceAt: 0,
  previewVisible: false,
  previewSceneId: undefined,
  previewSectionId: undefined,
  previewLineId: undefined,
  presentationState: {},
  sectionLineChanges: {},
  isMuted: false,
  isScenePageLoading: true,
  isSceneAssetLoading: false,
  lockingLineId: null, // Lock to prevent duplicate split/merge operations
  deadEndTooltip: {
    open: false,
    x: 0,
    y: 0,
    content: "",
  },
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setMobileKeyboardVisible = ({ state }, { isVisible } = {}) => {
  state.mobileKeyboardVisible = isVisible === true;
};

export const selectMobileKeyboardVisible = ({ state }) => {
  return state.mobileKeyboardVisible;
};

export const setSceneId = ({ state }, { sceneId } = {}) => {
  state.sceneId = sceneId;
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

export const setEditorSession = ({ state }, { editorSession } = {}) => {
  state.editorSession = editorSession;
};

export const clearEditorSession = ({ state }, _payload = {}) => {
  state.editorSession = undefined;
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

export const setPresentationState = ({ state }, { presentationState } = {}) => {
  state.presentationState = presentationState;
};

export const setSectionLineChanges = ({ state }, { changes } = {}) => {
  state.sectionLineChanges = changes;
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

export const selectEditorSession = ({ state }) => {
  return state.editorSession;
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
  const soundsData = state.repositoryState.sounds || {
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
            filesData: files,
            soundsData,
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
  return overlaySceneWithEditorSession(baseScene, state.editorSession);
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
  state.selectedLineId = selectedLineId;
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

export const showSectionDropdownMenu = (
  { state },
  { position, sectionId } = {},
) => {
  const scene = selectCommittedScene({ state });
  const items = [{ label: "Edit", type: "item", value: "edit-section" }];

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
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    actionsType: null,
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

export const showSectionCreateDialog = ({ state }, { defaultName } = {}) => {
  state.sectionCreateDialog = {
    isOpen: true,
    formKey: (state.sectionCreateDialog?.formKey || 0) + 1,
    mode: "create",
    sectionId: undefined,
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
  };
};

export const showSceneSettingsDialog = ({ state }, _payload = {}) => {
  state.sceneSettingsDialog.isOpen = true;
  state.sceneSettingsDialog.formKey += 1;
  state.sceneSettingsDialog.defaultValues = {
    showLineNumbers: state.sceneSettings.showLineNumbers,
    isMuted: state.isMuted,
  };
};

export const hideSceneSettingsDialog = ({ state }, _payload = {}) => {
  state.sceneSettingsDialog.isOpen = false;
};

export const setSceneSettings = (
  { state },
  { showLineNumbers, isMuted } = {},
) => {
  state.sceneSettings.showLineNumbers =
    showLineNumbers ?? state.sceneSettings.showLineNumbers;
  state.isMuted = isMuted ?? state.isMuted;
};

export const selectProjectData = ({ state }) => {
  return constructProjectData(buildProjectDataSourceState(state));
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

export const selectViewData = ({ state }) => {
  const scene = selectScene({ state });
  if (!scene) {
    return {
      scene: { id: "", name: "Scene", sections: [] },
      sections: [],
      sectionsOverviewOpen: false,
      sectionsOverviewItems: [],
      currentLines: [],
      currentLine: null,
      actionsData: [],
      presentationState: null,
      dropdownMenu: state.dropdownMenu,
      popover: state.popover,
      selectedLineId: state.selectedLineId,
      isTouchMode: state.isTouchMode,
      mobileKeyboardVisible: state.mobileKeyboardVisible,
      mobileTopBarVisibility: state.mobileKeyboardVisible
        ? "hidden"
        : "visible",
      mobileTopBarPointerEvents: state.mobileKeyboardVisible ? "none" : "auto",
      currentSectionName: "",
      mobileEditorBottomPadding: "0px",
      sectionsGraphView: state.sectionsGraphView,
      layouts: [],
      allCharacters: [],
      sectionsGraph: JSON.stringify(
        { nodes: [], edges: [], adjacencyList: {} },
        null,
        2,
      ),
      canvasAspectRatio: selectCanvasAspectRatio({ state }),
      isScenePageLoading: state.isScenePageLoading,
      isSceneAssetLoading: state.isSceneAssetLoading,
      deadEndTooltip: state.deadEndTooltip,
    };
  }

  const repositoryState = selectRepositoryState({ state });
  const layouts = repositoryState.layouts || { items: {} };
  const controls = repositoryState.controls || { items: {} };
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

  // const currentLines = state.sections.find(section => section.id === state.selectedSectionId).lines;

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
      : null;

  // Get current section for lines/actions panel
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );
  const currentSectionName = currentSection?.name ?? "";

  const selectedLine = currentSection?.lines?.find(
    (line) => line.id === state.selectedLineId,
  );
  const currentLines = buildSceneEditorLineViewModels({
    lines: Array.isArray(currentSection?.lines) ? currentSection.lines : [],
    repositoryState,
    sectionLineChanges: state.sectionLineChanges,
  });

  const isEditingSection = state.sectionCreateDialog.mode === "edit";
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
    currentLines,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: sectionForm,
    selectedLineId: state.selectedLineId,
    selectedLine,
    isTouchMode: state.isTouchMode,
    mobileKeyboardVisible: state.mobileKeyboardVisible,
    mobileTopBarVisibility: state.mobileKeyboardVisible ? "hidden" : "visible",
    mobileTopBarPointerEvents: state.mobileKeyboardVisible ? "none" : "auto",
    currentSectionName,
    mobileEditorBottomPadding: state.isTouchMode
      ? "calc(96px + env(safe-area-inset-bottom))"
      : "0px",
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
    presentationState: state.presentationState,
    sectionLineChanges: state.sectionLineChanges,
    sectionCreateDialog: state.sectionCreateDialog,
    sectionCreateForm,
    sceneSettings: state.sceneSettings,
    linesEditorKey: state.sceneSettings.showLineNumbers
      ? "line-numbers-show"
      : "line-numbers-hide",
    sceneSettingsDialog: state.sceneSettingsDialog,
    sceneSettingsForm,
    isScenePageLoading: state.isScenePageLoading,
    isSceneAssetLoading: state.isSceneAssetLoading,
    deadEndTooltip: state.deadEndTooltip,
  };
};

export const selectLineIdIndex = ({ state }, props, payload) => {
  const { lineId } = payload;
  return state.currentLines.findIndex((line) => line.id === lineId);
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
