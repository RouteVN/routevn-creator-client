import { nanoid } from "nanoid";
import {
  extractFileIdsForLayouts,
  extractSceneIdsFromValue,
  extractFileIdsForScenes,
  extractInitialHybridSceneIds,
  extractLayoutIdsFromValue,
  resolveEventBindings,
  extractTransitionTargetSceneIds,
  extractTransitionTargetSceneIdsFromActions,
} from "../../utils/index.js";
import { debugLog, previewDebugText } from "../../utils/debugLog.js";
import { filter, tap, debounceTime } from "rxjs";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another scene.";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const findNonCloneablePaths = (root, limit = 5) => {
  const paths = [];
  const queue = [{ value: root, path: "$" }];
  const visited = new WeakSet();

  const isWindowLike = (value) =>
    typeof window !== "undefined" && value === window;
  const isNodeLike = (value) =>
    typeof Node !== "undefined" && value instanceof Node;
  const isEventLike = (value) =>
    typeof Event !== "undefined" && value instanceof Event;

  while (queue.length > 0 && paths.length < limit) {
    const { value, path } = queue.shift();

    if (!value || typeof value !== "object") {
      continue;
    }

    if (isWindowLike(value) || isNodeLike(value) || isEventLike(value)) {
      paths.push(path);
      continue;
    }

    if (visited.has(value)) {
      continue;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        queue.push({ value: item, path: `${path}[${index}]` });
      });
      continue;
    }

    Object.entries(value).forEach(([key, item]) => {
      queue.push({ value: item, path: `${path}.${key}` });
    });
  }

  return paths;
};

const cloneWithDiagnostics = (value, label) => {
  try {
    return structuredClone(value);
  } catch (error) {
    if (error?.name === "DataCloneError") {
      const paths = findNonCloneablePaths(value);
      console.error(
        `[sceneEditor] Non-cloneable data in ${label}. Possible paths:`,
        paths.length > 0 ? paths : ["(path not detected)"],
      );
    }
    throw error;
  }
};

// Helper function to create assets object from file references
async function createAssetsFromFileIds(
  fileReferences,
  projectService,
  resources,
) {
  const { sounds, images, videos = {}, fonts = {} } = resources;
  const allItems = Object.entries({
    ...sounds,
    ...images,
    ...videos,
    ...fonts,
  }).map(([key, val]) => {
    return {
      id: key,
      ...val,
    };
  });
  const assets = {};
  for (const fileObj of fileReferences) {
    const { url: fileId } = fileObj;
    const foundItem = allItems.find((item) => item.fileId === fileId);
    try {
      const { url } = await projectService.getFileContent(fileId);
      let type = foundItem?.fileType; // Use type from fileObj first

      // If no type in fileObj, look it up in the resources
      if (!type) {
        Object.entries(sounds.items || {})
          .concat(Object.entries(images.items || {}))
          .concat(Object.entries(videos.items || {}))
          .concat(Object.entries(fonts.items || {}))
          .forEach(([_key, item]) => {
            if (item.fileId === fileId) {
              type = item.fileType;
            }
          });
      }

      assets[fileId] = {
        url,
        type: type || "image/png", // fallback to image/png
      };
    } catch (error) {
      console.error(`Failed to load file ${fileId}:`, error);
    }
  }

  return assets;
}

const isMinimalAdvDialogue = (dialogue) => {
  if (!dialogue || typeof dialogue !== "object") {
    return false;
  }

  const keysWithoutContent = Object.keys(dialogue).filter(
    (key) => key !== "content",
  );

  return keysWithoutContent.length === 1 && dialogue.mode === "adv";
};

const shouldInheritNvlModeFromPreviousLine = ({
  domainState,
  sectionId,
  lineId,
  existingDialogue,
}) => {
  const section = domainState?.sections?.[sectionId];
  if (!section) {
    return false;
  }

  if (existingDialogue?.mode === "nvl") {
    return false;
  }

  if (existingDialogue?.mode && !isMinimalAdvDialogue(existingDialogue)) {
    return false;
  }

  const lineOrder = section.lineIds || [];
  const currentIndex = lineOrder.indexOf(lineId);
  if (currentIndex <= 0) {
    return false;
  }

  const previousLineId = lineOrder[currentIndex - 1];
  if (!previousLineId) {
    return false;
  }

  const previousDialogue =
    domainState?.lines?.[previousLineId]?.actions?.dialogue;
  return previousDialogue?.mode === "nvl";
};

const createAssetLoadCache = () => ({
  sceneIds: new Set(),
  fileIds: new Set(),
});

let assetLoadCache = createAssetLoadCache();

const resetAssetLoadCache = () => {
  assetLoadCache = createAssetLoadCache();
};

const setSceneAssetLoading = (deps, isLoading) => {
  const { store, render } = deps;
  store.setSceneAssetLoading({ isLoading: isLoading });
  render();
};

const syncStoreProjectState = (store, projectService) => {
  const repositoryState = projectService.getState();
  store.setRepositoryState({ repository: repositoryState });
  store.setDomainState({
    domainState: projectService.getDomainState(),
  });
  return repositoryState;
};

const getLinesEditorRef = (refs) => {
  return refs?.linesEditor;
};

const focusLinesEditorLine = (refs, payload = {}) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef) {
    return;
  }

  linesEditorRef.focusLine(payload);
};

const scrollLinesEditorLineIntoView = (refs, lineId) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef || !lineId) {
    return;
  }

  linesEditorRef.scrollLineIntoView({ lineId });
};

const getDialogueText = (line) => {
  return (line?.actions?.dialogue?.content || [])
    .map((item) => item?.text ?? "")
    .join("");
};

const resolveMergeLinesContext = (domainState, currentLineId) => {
  const currentLine = domainState?.lines?.[currentLineId];
  const sectionId = currentLine?.sectionId;
  const section = sectionId ? domainState?.sections?.[sectionId] : undefined;
  const lineIds = section?.lineIds || [];
  const currentIndex = lineIds.indexOf(currentLineId);

  if (!currentLine || currentIndex <= 0) {
    return {};
  }

  const prevLineId = lineIds[currentIndex - 1];
  const prevLine = domainState?.lines?.[prevLineId];

  if (!prevLineId || !prevLine) {
    return {};
  }

  return {
    sectionId,
    currentLine,
    prevLineId,
    prevLine,
  };
};

const isMissingLinePreconditionError = (error, lineId) => {
  return (
    error?.name === "DomainPreconditionError" &&
    error?.message === "line not found" &&
    (!lineId || error?.details?.lineId === lineId)
  );
};

async function loadAssetsForSceneIds(
  deps,
  projectData,
  sceneIds,
  { showLoading = true } = {},
) {
  const { graphicsService, projectService, appService } = deps;
  const allScenes = projectData?.story?.scenes || {};

  const uniqueSceneIds = Array.from(new Set(sceneIds || [])).filter(
    (sceneId) => !!allScenes[sceneId],
  );
  if (uniqueSceneIds.length === 0) {
    return;
  }

  const fileReferences = extractFileIdsForScenes(projectData, uniqueSceneIds);
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    return fileId && !assetLoadCache.fileIds.has(fileId);
  });
  const isAnySceneUntracked = uniqueSceneIds.some(
    (sceneId) => !assetLoadCache.sceneIds.has(sceneId),
  );

  if (missingFileReferences.length === 0 && !isAnySceneUntracked) {
    return;
  }

  const shouldShowLoading = showLoading && missingFileReferences.length > 0;

  try {
    if (shouldShowLoading) {
      setSceneAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const assets = await createAssetsFromFileIds(
        missingFileReferences,
        projectService,
        projectData.resources,
      );
      await graphicsService.loadAssets(assets);

      Object.keys(assets).forEach((fileId) => {
        if (fileId) {
          assetLoadCache.fileIds.add(fileId);
        }
      });
    }

    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.sceneIds.add(sceneId);
    });
  } catch (error) {
    appService?.showToast("Failed to load some scene assets", {
      title: "Warning",
    });
    console.error("[sceneEditor] Failed to load scene assets:", error);
  } finally {
    if (shouldShowLoading) {
      setSceneAssetLoading(deps, false);
    }
  }
}

const preloadDirectTransitionScenes = async (deps, projectData, sceneIds) => {
  const directTargets = Array.from(
    new Set(
      (sceneIds || []).flatMap((sceneId) =>
        extractTransitionTargetSceneIds(projectData, sceneId),
      ),
    ),
  );

  if (directTargets.length === 0) {
    return;
  }

  await loadAssetsForSceneIds(deps, projectData, directTargets, {
    showLoading: false,
  });
};

const preloadLayoutAssetsByIds = async (deps, projectData, layoutIds) => {
  const uniqueLayoutIds = Array.from(new Set(layoutIds || [])).filter(
    (layoutId) => Boolean(projectData?.resources?.layouts?.[layoutId]),
  );

  if (uniqueLayoutIds.length === 0) {
    return;
  }

  const fileReferences = extractFileIdsForLayouts(projectData, uniqueLayoutIds);
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    return fileId && !assetLoadCache.fileIds.has(fileId);
  });

  if (missingFileReferences.length === 0) {
    return;
  }

  const { graphicsService, projectService } = deps;
  const assets = await createAssetsFromFileIds(
    missingFileReferences,
    projectService,
    projectData.resources,
  );
  await graphicsService.loadAssets(assets);

  Object.keys(assets).forEach((fileId) => {
    if (fileId) {
      assetLoadCache.fileIds.add(fileId);
    }
  });
};

const createBeforeHandleActionsHook = (deps) => {
  const { store } = deps;
  return async (actions, eventContext) => {
    const projectData = store.selectProjectData();
    const eventData = eventContext?._event;
    const resolvedActions = resolveEventBindings(actions, eventData);
    const layoutIds = Array.from(
      new Set([
        ...extractLayoutIdsFromValue(resolvedActions, projectData),
        ...extractLayoutIdsFromValue(eventData, projectData),
      ]),
    );
    if (layoutIds.length > 0) {
      await preloadLayoutAssetsByIds(deps, projectData, layoutIds);
    }

    const transitionSceneIds = Array.from(
      new Set([
        ...extractTransitionTargetSceneIdsFromActions(
          resolvedActions,
          projectData,
        ),
        ...extractTransitionTargetSceneIdsFromActions(eventData, projectData),
        ...extractSceneIdsFromValue(resolvedActions, projectData),
        ...extractSceneIdsFromValue(eventData, projectData),
      ]),
    );

    if (transitionSceneIds.length === 0) {
      return;
    }

    await loadAssetsForSceneIds(deps, projectData, transitionSceneIds, {
      showLoading: false,
    });
    await preloadDirectTransitionScenes(deps, projectData, transitionSceneIds);
  };
};

// Helper function to render the scene state
async function renderSceneState(store, graphicsService, payload = {}) {
  const { skipAnimations = false } = payload;
  const projectData = store.selectProjectData();
  const safeProjectData = cloneWithDiagnostics(
    projectData,
    "projectData passed to updateProjectData",
  );
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  const isMuted = store.selectIsMuted();
  graphicsService.engineHandleActions({
    updateProjectData: {
      projectData: safeProjectData,
    },
    jumpToLine: {
      sectionId,
      lineId,
    },
  });
  graphicsService.engineRenderCurrentState({
    skipAudio: isMuted,
    skipAnimations,
  });

  // Disable auto-advance in edit mode - setNextLineConfig should only work in preview mode
  graphicsService.engineHandleActions({
    setNextLineConfig: {
      auto: {
        enabled: false,
      },
    },
  });

  // Update presentation state after rendering
  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState({ presentationState: presentationState });
}

function createProjectDataWithSelectedEntryPoint(projectData, selection) {
  const { sceneId, sectionId, lineId } = selection;
  const projectDataWithSelection = structuredClone(projectData);

  if (!sceneId || !projectDataWithSelection?.story?.scenes?.[sceneId]) {
    return projectDataWithSelection;
  }

  projectDataWithSelection.story.initialSceneId = sceneId;
  const selectedScene = projectDataWithSelection.story.scenes[sceneId];

  if (sectionId && selectedScene.sections?.[sectionId]) {
    selectedScene.initialSectionId = sectionId;

    if (lineId) {
      selectedScene.sections[sectionId].initialLineId = lineId;
    }
  }

  return projectDataWithSelection;
}

// Shared helper to write dialogue content to repository
async function writeDialogueContent(deps, lineId, { sectionId, content }) {
  const { projectService } = deps;

  // Get existing dialogue to preserve other properties (layoutId, characterId, etc.)
  const domainState = projectService.getDomainState();
  const existingDialogue =
    domainState?.lines?.[lineId]?.actions?.dialogue || {};
  const shouldInheritNvlMode = shouldInheritNvlModeFromPreviousLine({
    domainState,
    sectionId,
    lineId,
    existingDialogue,
  });

  debugLog("lines", "scene.write-dialogue", {
    lineId,
    sectionId,
    contentLength: (content || []).map((item) => item?.text ?? "").join("")
      .length,
    content: previewDebugText(
      (content || []).map((item) => item?.text ?? "").join(""),
    ),
  });

  await projectService.updateLineActions({
    lineId,
    patch: {
      dialogue: {
        ...existingDialogue,
        ...(shouldInheritNvlMode ? { mode: "nvl" } : {}),
        content,
      },
    },
    replace: false,
  });
}

// Helper to flush dialogue queue
async function flushDialogueQueue(deps) {
  const { dialogueQueueService } = deps;

  debugLog("lines", "scene.flush-dialogue-queue:start", {
    pendingSize: dialogueQueueService.size(),
  });

  await dialogueQueueService.flush(async (lineId, data) => {
    await writeDialogueContent(deps, lineId, data);
  });

  debugLog("lines", "scene.flush-dialogue-queue:end", {
    pendingSize: dialogueQueueService.size(),
  });
}

const applyPendingDialogueQueueToStore = (store, dialogueQueueService) => {
  for (const [lineId, data] of dialogueQueueService.entries()) {
    if (!lineId || !Array.isArray(data?.content)) {
      continue;
    }

    store.setLineTextContent({
      lineId,
      content: data.content,
    });
  }
};

const findCharacterIdByShortcut = (repositoryState, shortcut) => {
  const normalizedShortcut = String(shortcut || "").trim();
  if (!normalizedShortcut) {
    return null;
  }

  const characters = repositoryState?.characters?.items || {};
  for (const [characterId, character] of Object.entries(characters)) {
    if (character?.type !== "character") {
      continue;
    }

    if (String(character?.shortcut || "").trim() === normalizedShortcut) {
      return characterId;
    }
  }

  return null;
};

export const handleBeforeMount = (deps) => {
  const { graphicsService, store } = deps;
  const cleanupSubscriptions = mountSubscriptions(deps);

  return async () => {
    cleanupSubscriptions();
    await flushDialogueQueue(deps);
    store.setSceneAssetLoading({ isLoading: false });
    resetAssetLoadCache();
    graphicsService.destroy();
  };
};

async function updateSectionChanges(deps) {
  const { store, graphicsService } = deps;
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) return;

  const changes = graphicsService.engineSelectSectionLineChanges({ sectionId });
  store.setSectionLineChanges({ changes: changes });
}

export const handleAfterMount = async (deps) => {
  const {
    refs,
    graphicsService,
    store,
    projectService,
    appService,
    render,
    subject,
  } = deps;

  // Ensure repository is loaded for sync access
  await projectService.ensureRepository();

  // Get scene selection from router payload
  const {
    sceneId,
    sectionId: payloadSectionId,
    lineId: payloadLineId,
  } = appService.getPayload();
  const state = syncStoreProjectState(store, projectService);

  if (state.fonts && state.fonts.items) {
    for (const font of Object.values(state.fonts.items)) {
      if (font.type === "font" && font.fileId && font.fontFamily) {
        await projectService.loadFontFile({
          fontName: font.fontFamily,
          fileId: font.fileId,
        });
      }
    }
  }

  store.setSceneId({ sceneId: sceneId });

  // Get scene to set selected section and line
  const scene = store.selectScene();
  if (scene && scene.sections && scene.sections.length > 0) {
    const selectedSection =
      scene.sections.find((section) => section.id === payloadSectionId) ||
      scene.sections[0];
    store.setSelectedSectionId({ selectedSectionId: selectedSection.id });

    // Select requested line in selected section when available, otherwise first line
    if (selectedSection.lines && selectedSection.lines.length > 0) {
      const selectedLine =
        selectedSection.lines.find((line) => line.id === payloadLineId) ||
        selectedSection.lines[0];
      store.setSelectedLineId({ selectedLineId: selectedLine.id });
    } else {
      store.setSelectedLineId({ selectedLineId: undefined });
    }
  }

  const { canvas } = refs;

  resetAssetLoadCache();
  store.setSceneAssetLoading({ isLoading: false });

  const beforeHandleActions = createBeforeHandleActionsHook(deps);
  await graphicsService.init({
    canvas: canvas,
    beforeHandleActions,
  });
  const projectData = store.selectProjectData();
  const initialProjectData = createProjectDataWithSelectedEntryPoint(
    projectData,
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
    },
  );

  const initialSceneIds = extractInitialHybridSceneIds(projectData, sceneId);
  await loadAssetsForSceneIds(deps, projectData, initialSceneIds, {
    showLoading: true,
  });
  void preloadDirectTransitionScenes(deps, projectData, initialSceneIds);
  graphicsService.initRouteEngine(initialProjectData);

  render();
  setTimeout(() => {
    subject.dispatch("sceneEditor.renderCanvas", {});
  }, 1000);
};

const scrollSectionTabIntoView = (deps, sectionId) => {
  const { refs } = deps;

  requestAnimationFrame(() => {
    const refIds = refs?.();
    const refElements = Object.values(refIds || {});
    const tabRef = refElements.find(
      (element) => element?.dataset?.sectionId === sectionId,
    );
    const tabElement =
      tabRef ||
      Array.from(document.querySelectorAll("[data-section-id]")).find(
        (element) => element.getAttribute("data-section-id") === sectionId,
      );

    tabElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });
};

const selectSection = async (deps, sectionId) => {
  const { store, render, subject } = deps;
  store.setSelectedSectionId({ selectedSectionId: sectionId });
  const scene = store.selectScene();
  const nextSection = scene?.sections?.find(
    (section) => section.id === sectionId,
  );
  if (nextSection && nextSection.lines && nextSection.lines.length > 0) {
    store.setSelectedLineId({ selectedLineId: nextSection.lines[0].id });
  } else {
    store.setSelectedLineId({ selectedLineId: undefined });
  }

  await updateSectionChanges(deps);

  render();
  scrollSectionTabIntoView(deps, sectionId);
  subject.dispatch("sceneEditor.renderCanvas", {});
};

const reconcileSceneSelection = (store) => {
  const scene = store.selectScene();
  const previousSectionId = store.selectSelectedSectionId();
  const previousLineId = store.selectSelectedLineId();

  if (!scene || !Array.isArray(scene.sections) || scene.sections.length === 0) {
    if (previousSectionId !== undefined) {
      store.setSelectedSectionId({ selectedSectionId: undefined });
    }
    if (previousLineId !== undefined) {
      store.setSelectedLineId({ selectedLineId: undefined });
    }
    return {
      sectionId: undefined,
      lineId: undefined,
    };
  }

  const resolvedSection =
    scene.sections.find((section) => section.id === previousSectionId) ||
    scene.sections[0];
  const resolvedSectionId = resolvedSection?.id;
  const resolvedLine =
    resolvedSection?.lines?.find((line) => line.id === previousLineId) ||
    resolvedSection?.lines?.[0];
  const resolvedLineId = resolvedLine?.id;

  if (resolvedSectionId !== previousSectionId) {
    store.setSelectedSectionId({ selectedSectionId: resolvedSectionId });
  }

  if (resolvedLineId !== previousLineId) {
    store.setSelectedLineId({ selectedLineId: resolvedLineId });
  }

  return {
    sectionId: resolvedSectionId,
    lineId: resolvedLineId,
  };
};

export const handleDataChanged = async (deps) => {
  const { store, projectService, render, subject, dialogueQueueService } = deps;
  await projectService.ensureRepository();

  if (store.selectLockingLineId()) {
    debugLog("lines", "scene.data-changed-skipped-while-locked", {
      lockingLineId: store.selectLockingLineId(),
    });
    return;
  }

  syncStoreProjectState(store, projectService);
  applyPendingDialogueQueueToStore(store, dialogueQueueService);

  reconcileSceneSelection(store);

  await updateSectionChanges(deps);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipAnimations: true,
  });
};

const isSectionsOverviewOpen = (store) => {
  return store.selectIsSectionsOverviewOpen();
};

export const handleSectionTabClick = async (deps, payload) => {
  const { store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionTab", "") ||
    "";
  await selectSection(deps, sectionId);
};

export const handleCommandLineSubmit = async (deps, payload) => {
  const {
    store,
    render,
    projectService,
    subject,
    graphicsService,
    appService,
  } = deps;
  const lineId = store.selectSelectedLineId();

  // Handle section/scene transitions
  if (payload._event.detail.sectionTransition) {
    if (!lineId) {
      console.warn("Section transition requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (sectionTransition)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await projectService.updateLineActions({
      lineId,
      patch: safeDetail,
      replace: false,
    });

    syncStoreProjectState(store, projectService);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneState(store, graphicsService);
    }, 10);
    return;
  }

  // Handle pushLayeredView
  if (payload._event.detail.pushLayeredView) {
    if (!lineId) {
      console.warn("Push layered view requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (pushLayeredView)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await projectService.updateLineActions({
      lineId,
      patch: safeDetail,
      replace: false,
    });

    syncStoreProjectState(store, projectService);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneState(store, graphicsService);
    }, 10);
    return;
  }

  // Handle popLayeredView
  if (payload._event.detail.popLayeredView) {
    if (!lineId) {
      console.warn("Pop layered view requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (popLayeredView)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await projectService.updateLineActions({
      lineId,
      patch: safeDetail,
      replace: false,
    });

    syncStoreProjectState(store, projectService);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneState(store, graphicsService);
    }, 10);
    return;
  }

  if (!lineId) {
    return;
  }

  let submissionData = payload._event.detail;

  // If this is a dialogue submission, preserve the existing content
  if (submissionData.dialogue) {
    const line = store.selectSelectedLine();
    if (line && line.actions?.dialogue?.content) {
      // Preserve existing text while updating dialogue metadata fields.
      submissionData = {
        ...submissionData,
        dialogue: {
          content: line.actions.dialogue.content,
          ...submissionData.dialogue,
        },
      };
    }
  }

  try {
    submissionData = cloneWithDiagnostics(
      submissionData,
      "command line submit detail (general)",
    );
  } catch {
    appService?.showToast("Invalid action payload (non-serializable data)", {
      title: "Error",
    });
    return;
  }

  await projectService.updateLineActions({
    lineId,
    patch: submissionData,
    replace: false,
  });

  syncStoreProjectState(store, projectService);
  render();

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleEditorDataChanged = async (deps, payload) => {
  const { subject, store, dialogueQueueService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const lineId = payload._event.detail.lineId;
  const selectedLineId = store.selectSelectedLineId();
  const lockingLineId = store.selectLockingLineId();

  if (!lineId) {
    return;
  }

  // Ignore late input events from a line that is no longer selected or is in
  // the middle of a structural split/merge operation.
  if (lineId !== selectedLineId || lineId === lockingLineId) {
    debugLog("lines", "scene.editor-data-ignored", {
      lineId,
      selectedLineId,
      lockingLineId,
      content: previewDebugText(payload._event.detail.content),
    });
    return;
  }

  const content = [{ text: payload._event.detail.content }];
  debugLog("lines", "scene.editor-data-accepted", {
    lineId,
    selectedLineId,
    lockingLineId,
    contentLength: payload._event.detail.content.length,
    content: previewDebugText(payload._event.detail.content),
  });

  // Update local store immediately for UI responsiveness
  store.setLineTextContent({ lineId, content });

  // Queue the pending update and schedule debounced write
  const sectionId =
    store.selectDomainState()?.lines?.[lineId]?.sectionId ??
    store.selectSelectedSectionId();
  try {
    debugLog("lines", "scene.editor-data-queued", {
      lineId,
      sectionId,
      content: previewDebugText(payload._event.detail.content),
    });
    dialogueQueueService.setAndSchedule(lineId, { sectionId, content });
  } catch (error) {
    console.error("[sceneEditor] Failed to queue dialogue update:", error);
  }

  // Trigger debounced canvas render with skipRender flag.
  // skipRender prevents full UI re-render which would reset cursor position while typing.
  // Typing only updates dialogue content, not presentationState, so State panel doesn't need to update.
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    skipAnimations: true,
  });
};

export const handleDialogueCharacterShortcut = async (deps, payload) => {
  const { store, projectService, render, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const lineId = detail.lineId || store.selectSelectedLineId();
  const shortcut = detail.shortcut;
  if (!lineId || !shortcut) {
    return;
  }

  await flushDialogueQueue(deps);

  const domainState = projectService.getDomainState();
  const existingDialogue =
    domainState?.lines?.[lineId]?.actions?.dialogue || {};

  const isClearShortcut = String(shortcut) === "0";
  if (isClearShortcut && !existingDialogue.characterId) {
    return;
  }

  let characterId = null;
  if (!isClearShortcut) {
    const repositoryState = projectService.getState();
    characterId = findCharacterIdByShortcut(repositoryState, shortcut);
    if (!characterId) {
      return;
    }
  }

  if (!isClearShortcut && existingDialogue.characterId === characterId) {
    return;
  }

  const selectedLine = store.selectSelectedLine();
  const selectedLineContent =
    selectedLine?.id === lineId
      ? selectedLine?.actions?.dialogue?.content
      : undefined;

  const updatedDialogue = {
    ...existingDialogue,
    ...(existingDialogue.content
      ? {}
      : selectedLineContent
        ? { content: selectedLineContent }
        : {}),
  };

  if (isClearShortcut) {
    delete updatedDialogue.characterId;
  } else {
    updatedDialogue.characterId = characterId;
  }

  await projectService.updateLineActions({
    lineId,
    patch: {
      dialogue: updatedDialogue,
    },
    replace: false,
  });

  syncStoreProjectState(store, projectService);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleAddActionsButtonClick = (deps) => {
  const { refs, render } = deps;
  refs.systemActions?.transformedHandlers?.open?.({
    mode: "actions",
  });
  render();
};

const createSectionWithName = async (deps, sectionName) => {
  const { store, projectService, render, graphicsService } = deps;
  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newLineId = nanoid();

  // Get layouts from repository to find first dialogue and base layouts
  const { layouts } = projectService.getState();
  let dialogueLayoutId = null;
  let baseLayoutId = null;

  if (layouts && layouts.items) {
    for (const [layoutId, layout] of Object.entries(layouts.items)) {
      if (!dialogueLayoutId && layout.layoutType === "dialogue") {
        dialogueLayoutId = layoutId;
      }
      if (!baseLayoutId && layout.layoutType === "base") {
        baseLayoutId = layoutId;
      }
      if (dialogueLayoutId && baseLayoutId) {
        break;
      }
    }
  }

  // Create actions object with dialogue and base layouts if found
  const actions = {
    dialogue: dialogueLayoutId
      ? {
          gui: {
            resourceId: dialogueLayoutId,
          },
          mode: "adv",
          content: [{ text: "" }],
        }
      : {
          mode: "adv",
          content: [{ text: "" }],
        },
  };

  if (baseLayoutId) {
    actions.base = {
      resourceId: baseLayoutId,
      resourceType: "layout",
    };
  }

  await projectService.createSectionItem({
    sceneId,
    sectionId: newSectionId,
    name: sectionName,
    position: "last",
  });
  await projectService.createLineItem({
    sectionId: newSectionId,
    lineId: newLineId,
    line: {
      actions,
    },
    position: "last",
  });

  // Update store with new repository state
  syncStoreProjectState(store, projectService);

  store.setSelectedSectionId({ selectedSectionId: newSectionId });
  store.setSelectedLineId({ selectedLineId: newLineId });
  render();
  scrollSectionTabIntoView(deps, newSectionId);

  // Render the canvas with the new section's data
  setTimeout(async () => {
    await renderSceneState(store, graphicsService);
  }, 10);
};

export const handleSectionAddClick = (deps) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  const defaultName = `Section ${sectionCount + 1}`;
  store.showSectionCreateDialog({ defaultName });
  render();
};

export const handleSectionsOverviewClick = (deps, payload) => {
  const { store, render } = deps;
  if (payload?._event) {
    payload._event.preventDefault();
  }

  if (typeof document !== "undefined" && document.activeElement?.blur) {
    document.activeElement.blur();
  }

  store.hideDeadEndTooltip();
  store.openSectionsOverviewPanel();
  render();
};

export const handleSectionsOverviewClose = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  store.closeSectionsOverviewPanel();
  render();
};

export const handleSectionsOverviewWarningMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showDeadEndTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    content: DEAD_END_TOOLTIP_CONTENT,
  });
  render();
};

export const handleSectionsOverviewWarningMouseLeave = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  render();
};

export const handleSectionsOverviewRowClick = async (deps, payload) => {
  const { store } = deps;
  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionOverviewRow", "") ||
    "";

  if (!sectionId) {
    return;
  }

  store.closeSectionsOverviewPanel();
  await selectSection(deps, sectionId);
};

export const handleSplitLine = async (deps, payload) => {
  const { projectService, store, render, refs, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = payload._event.detail;

  // Check if this line is already being processed (split/merge)
  const lockingLineId = store.selectLockingLineId();

  if (lockingLineId === lineId) {
    return;
  }

  // Mark this line as being processed IMMEDIATELY to prevent duplicate operations
  store.setLockingLineId({ lineId: lineId });
  let shouldReleaseLockAfterFocus = false;

  try {
    const newLineId = nanoid();

    // Flush pending dialogue updates before modifying repository
    await flushDialogueQueue(deps);

    const domainState = projectService.getDomainState();
    const existingDialogue =
      domainState?.lines?.[lineId]?.actions?.dialogue || {};
    debugLog("lines", "scene.split.after-flush", {
      lineId,
      newLineId,
      domainContent: previewDebugText(
        (domainState?.lines?.[lineId]?.actions?.dialogue?.content || [])
          .map((item) => item?.text ?? "")
          .join(""),
      ),
      leftContent: previewDebugText(leftContent),
      rightContent: previewDebugText(rightContent),
    });

    // First, update the current line with the left content
    // Only update the dialogue.content, preserve everything else
    const leftContentArray = leftContent
      ? [{ text: leftContent }]
      : [{ text: "" }];

    if (existingDialogue && Object.keys(existingDialogue).length > 0) {
      await projectService.updateLineActions({
        lineId,
        patch: {
          dialogue: {
            ...existingDialogue,
            content: leftContentArray,
          },
        },
        replace: false,
      });
    } else {
      await projectService.updateLineActions({
        lineId,
        patch: {
          dialogue: {
            content: leftContentArray,
          },
        },
        replace: false,
      });
    }

    // Then, create a new line with the right content and insert it after the current line
    // New line should have empty actions except for dialogue.content
    const rightContentArray = rightContent
      ? [{ text: rightContent }]
      : [{ text: "" }];
    const shouldInheritNvl =
      existingDialogue?.mode === "nvl" ||
      shouldInheritNvlModeFromPreviousLine({
        domainState,
        sectionId,
        lineId,
        existingDialogue,
      });
    const shouldCreateDialogueAction = shouldInheritNvl || !!rightContent;
    const newLineActions = shouldCreateDialogueAction
      ? {
          dialogue: {
            mode: shouldInheritNvl ? "nvl" : "adv",
            ...(rightContent ? { content: rightContentArray } : {}),
          },
        }
      : {};

    const linesEditorRef = getLinesEditorRef(refs);
    debugLog("lines", "scene.split.start", {
      lineId,
      sectionId,
      newLineId,
      leftContent: previewDebugText(leftContent),
      rightContent: previewDebugText(rightContent),
    });

    await projectService.createLineItem({
      sectionId,
      lineId: newLineId,
      line: {
        actions: newLineActions,
      },
      afterLineId: lineId,
    });
    debugLog("lines", "scene.split.created-line", {
      lineId,
      newLineId,
      leftContent: previewDebugText(leftContent),
      rightContent: previewDebugText(rightContent),
    });

    syncStoreProjectState(store, projectService);
    store.setSelectedLineId({ selectedLineId: newLineId });
    render();
    shouldReleaseLockAfterFocus = true;

    requestAnimationFrame(() => {
      if (linesEditorRef) {
        linesEditorRef.focusLine({
          lineId: newLineId,
          cursorPosition: 0,
          goalColumn: 0,
          direction: "down",
          syncLineId: lineId,
        });
      }

      requestAnimationFrame(() => {
        store.clearLockingLineId();
      });
    });

    // Trigger debounced canvas render
    subject.dispatch("sceneEditor.renderCanvas", {});
  } finally {
    if (!shouldReleaseLockAfterFocus) {
      store.clearLockingLineId();
    }
  }
};

export const handlePasteLines = async (deps, payload) => {
  const { projectService, store, render, refs, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent, lines } = payload._event.detail;

  // Flush pending dialogue updates before modifying repository
  await flushDialogueQueue(deps);

  // Get existing dialogue data to determine mode inheritance
  const domainState = projectService.getDomainState();
  const existingDialogue =
    domainState?.lines?.[lineId]?.actions?.dialogue || {};

  const shouldInheritNvl =
    existingDialogue?.mode === "nvl" ||
    shouldInheritNvlModeFromPreviousLine({
      domainState,
      sectionId,
      lineId,
      existingDialogue,
    });

  // First line content: leftContent + first pasted line
  const firstLineContent = leftContent + lines[0];

  // Update the current line with the first line content
  const firstContentArray = [{ text: firstLineContent }];
  if (existingDialogue && Object.keys(existingDialogue).length > 0) {
    await projectService.updateLineActions({
      lineId,
      patch: {
        dialogue: {
          ...existingDialogue,
          content: firstContentArray,
        },
      },
      replace: false,
    });
  } else {
    await projectService.updateLineActions({
      lineId,
      patch: {
        dialogue: {
          content: firstContentArray,
        },
      },
      replace: false,
    });
  }

  // Create new lines for remaining pasted lines
  let lastCreatedLineId = lineId;
  let afterLineId = lineId;

  for (let i = 1; i < lines.length; i++) {
    const newLineId = nanoid();
    const isLastLine = i === lines.length - 1;

    // Last pasted line gets combined with rightContent
    const lineContent = isLastLine ? lines[i] + rightContent : lines[i];

    const newLineActions = {
      dialogue: {
        mode: shouldInheritNvl ? "nvl" : "adv",
        content: [{ text: lineContent }],
      },
    };

    await projectService.createLineItem({
      sectionId,
      lineId: newLineId,
      line: {
        actions: newLineActions,
      },
      afterLineId,
    });

    afterLineId = newLineId;
    lastCreatedLineId = newLineId;
  }

  // If only one line was pasted, add rightContent to current line
  if (lines.length === 1) {
    const combinedContent = firstLineContent + rightContent;
    const combinedContentArray = [{ text: combinedContent }];
    if (existingDialogue && Object.keys(existingDialogue).length > 0) {
      await projectService.updateLineActions({
        lineId,
        patch: {
          dialogue: {
            ...existingDialogue,
            content: combinedContentArray,
          },
        },
        replace: false,
      });
    } else {
      await projectService.updateLineActions({
        lineId,
        patch: {
          dialogue: {
            content: combinedContentArray,
          },
        },
        replace: false,
      });
    }
    lastCreatedLineId = lineId;
  }

  // Update store with new repository state
  syncStoreProjectState(store, projectService);

  // Set cursor position at end of last line
  const linesEditorRef = getLinesEditorRef(refs);
  const lastLineContent =
    lines.length === 1
      ? firstLineContent + rightContent
      : lines[lines.length - 1] + rightContent;
  const cursorPosition = lastLineContent.length - rightContent.length;

  // Update selectedLineId
  store.setSelectedLineId({ selectedLineId: lastCreatedLineId });

  // Render after setting the selected line ID
  render();

  // Focus the last created line
  requestAnimationFrame(() => {
    if (linesEditorRef) {
      linesEditorRef.focusLine({
        lineId: lastCreatedLineId,
        cursorPosition: cursorPosition,
        goalColumn: cursorPosition,
        direction: null,
        syncLineId: lineId,
      });
    }
  });

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleNewLine = async (deps, payload) => {
  const { store, render, projectService, subject, refs } = deps;
  const detail = payload?._event?.detail || {};

  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) {
    return;
  }

  const requestedPosition =
    detail.position === "before" || detail.position === "after"
      ? detail.position
      : null;
  const referenceLineId =
    typeof detail.lineId === "string" && detail.lineId ? detail.lineId : null;

  const selectedLine = store.selectSelectedLine();
  const selectedLineId = store.selectSelectedLineId();
  const baseLineId = referenceLineId || selectedLineId || selectedLine?.id;

  if (requestedPosition && !baseLineId) {
    return;
  }

  // Persist pending line text before mutating the section structure.
  await flushDialogueQueue(deps);

  const domainState = projectService.getDomainState();
  const existingDialogue = baseLineId
    ? domainState?.lines?.[baseLineId]?.actions?.dialogue || {}
    : selectedLine?.actions?.dialogue || {};
  const shouldInheritNvl =
    existingDialogue?.mode === "nvl" ||
    shouldInheritNvlModeFromPreviousLine({
      domainState,
      sectionId,
      lineId: baseLineId,
      existingDialogue,
    });
  const newLineActions = shouldInheritNvl
    ? {
        dialogue: {
          mode: "nvl",
        },
      }
    : {};

  const scene = store.selectScene();
  const selectedSection = scene?.sections?.find(
    (section) => section?.id === sectionId,
  );
  const orderedLineIds = Array.isArray(selectedSection?.lines)
    ? selectedSection.lines
        .map((line) => line?.id)
        .filter((lineId) => typeof lineId === "string" && lineId)
    : [];
  const baseLineIndex = baseLineId ? orderedLineIds.indexOf(baseLineId) : -1;

  let afterLineId = null;
  if (requestedPosition === "after" && baseLineId) {
    afterLineId = baseLineId;
  } else if (requestedPosition === "before" && baseLineId) {
    afterLineId = baseLineIndex > 0 ? orderedLineIds[baseLineIndex - 1] : null;
  }

  const createLinePayload = {
    sectionId,
    lineId: newLineId,
    line: {
      actions: newLineActions,
    },
  };

  if (afterLineId) {
    createLinePayload.afterLineId = afterLineId;
  } else if (!requestedPosition) {
    createLinePayload.position = "last";
  }

  await projectService.createLineItem(createLinePayload);

  if (requestedPosition === "before" && baseLineIndex === 0) {
    await projectService.moveLineItem({
      lineId: newLineId,
      toSectionId: sectionId,
      index: 0,
    });
  }

  syncStoreProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: newLineId });

  const shouldEnterInsertMode = !!requestedPosition;
  const linesEditorRef = getLinesEditorRef(refs);

  render();

  if (shouldEnterInsertMode && linesEditorRef) {
    requestAnimationFrame(() => {
      linesEditorRef.focusLine({
        lineId: newLineId,
        cursorPosition: 0,
        goalColumn: 0,
        direction: null,
      });
    });
  }

  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleLineNavigation = (deps, payload) => {
  const { store, refs, render, subject, graphicsService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const { targetLineId, mode, direction, targetCursorPosition } =
    payload._event.detail;

  // For block mode, just update the selection and handle scrolling
  if (mode === "block") {
    const currentLineId = store.selectSelectedLineId();

    // Check if we're trying to move up from the first line
    if (direction === "up" && currentLineId === targetLineId) {
      // First line - show animation effects
      graphicsService.render({
        elements: [],
        transitions: [],
      });
      subject.dispatch("sceneEditor.renderCanvas", {});
      return;
    }

    store.setSelectedLineId({ selectedLineId: targetLineId });
    render();

    if (targetLineId) {
      requestAnimationFrame(() => {
        scrollLinesEditorLineIntoView(refs, targetLineId);
      });
    }

    // Trigger debounced canvas render
    subject.dispatch("sceneEditor.renderCanvas", {});
    return;
  }

  // For text-editor mode, handle cursor navigation
  const currentLineId = store.selectSelectedLineId();
  let nextLineId = targetLineId;

  // Determine next line based on direction if targetLineId is current line
  if (targetLineId === currentLineId) {
    if (direction === "up" || direction === "end") {
      nextLineId = store.selectPreviousLineId({ lineId: currentLineId });
    } else if (direction === "down") {
      nextLineId = store.selectNextLineId({ lineId: currentLineId });
    }
  }

  // Handle navigation to different line
  if (nextLineId && nextLineId !== currentLineId) {
    const linesEditorRef = getLinesEditorRef(refs);

    // Update selectedLineId through the store
    store.setSelectedLineId({ selectedLineId: nextLineId });
    render();

    requestAnimationFrame(() => {
      if (linesEditorRef) {
        const isEndNavigation = targetCursorPosition === -1;
        focusLinesEditorLine(refs, {
          lineId: nextLineId,
          cursorPosition: isEndNavigation
            ? Number.MAX_SAFE_INTEGER
            : targetCursorPosition,
          goalColumn: isEndNavigation
            ? Number.MAX_SAFE_INTEGER
            : targetCursorPosition,
          direction: direction ?? null,
        });
      }

      // Trigger debounced canvas render
      subject.dispatch("sceneEditor.renderCanvas", {});
    });
  } else if (direction === "up" && currentLineId === targetLineId) {
    // First line - show animation effects
    graphicsService.render({
      elements: [],
      transitions: [],
    });
    render();
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleSwapLine = async (deps, payload) => {
  const { store, projectService, render, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const direction =
    detail.direction === "up" || detail.direction === "down"
      ? detail.direction
      : null;
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const sectionId = store.selectSelectedSectionId();

  if (!direction || !lineId || !sectionId) {
    return;
  }

  const scene = store.selectScene();
  const section = scene?.sections?.find((item) => item.id === sectionId);
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  if (currentIndex < 0) {
    return;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= lines.length) {
    return;
  }

  await flushDialogueQueue(deps);
  await projectService.moveLineItem({
    lineId,
    toSectionId: sectionId,
    index: targetIndex,
  });

  syncStoreProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: lineId });
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleMergeLines = async (deps, payload) => {
  const { store, refs, render, projectService, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const { currentLineId } = payload._event.detail;

  // Check if this line is already being processed (split/merge)
  const lockingLineId = store.selectLockingLineId();

  if (lockingLineId) {
    return;
  }

  store.setLockingLineId({ lineId: currentLineId });
  let shouldReleaseLockAfterFocus = false;
  let resolvedPrevLineId;

  try {
    // Flush pending dialogue updates before modifying repository
    await flushDialogueQueue(deps);

    // Re-resolve merge targets from authoritative domain state after the queue
    // flush so held Backspace cannot operate on stale DOM/store state.
    const domainState = projectService.getDomainState();
    const { currentLine, prevLineId, prevLine } = resolveMergeLinesContext(
      domainState,
      currentLineId,
    );
    resolvedPrevLineId = prevLineId;

    if (!currentLine || !prevLineId || !prevLine) {
      return;
    }

    const prevContentText = getDialogueText(prevLine);
    const currentContentText = getDialogueText(currentLine);
    const mergedContent = prevContentText + currentContentText;

    // Store the length of the previous content for cursor positioning
    const prevContentLength = prevContentText.length;

    // Get existing dialogue data to preserve layoutId and characterId
    let existingDialogue = {};
    if (prevLine.actions?.dialogue) {
      existingDialogue = prevLine.actions.dialogue;
    }

    const finalContent = [{ text: mergedContent }];
    // Update previous line with merged content
    await projectService.updateLineActions({
      lineId: prevLineId,
      patch: {
        dialogue: {
          ...existingDialogue,
          content: finalContent,
        },
      },
      replace: false,
    });

    // Re-check existence in case another merge/delete removed the line while the
    // previous update command was being processed.
    if (!projectService.getDomainState()?.lines?.[currentLineId]) {
      return;
    }

    try {
      await projectService.deleteLineItem({ lineId: currentLineId });
    } catch (error) {
      if (isMissingLinePreconditionError(error, currentLineId)) {
        return;
      }

      throw error;
    }

    // Update repository state in store to reflect the changes
    syncStoreProjectState(store, projectService);

    // Update selected line to the previous one
    store.setSelectedLineId({ selectedLineId: prevLineId });

    // Pre-configure the linesEditor for cursor positioning
    const linesEditorRef = getLinesEditorRef(refs);

    // Render and then focus
    render();
    shouldReleaseLockAfterFocus = true;

    requestAnimationFrame(() => {
      if (linesEditorRef) {
        linesEditorRef.focusLine({
          lineId: prevLineId,
          cursorPosition: prevContentLength,
          goalColumn: prevContentLength,
          direction: null,
        });
      }

      requestAnimationFrame(() => {
        store.clearLockingLineId();
      });
    });

    // Trigger debounced canvas render
    subject.dispatch("sceneEditor.renderCanvas", {});
  } catch (error) {
    if (
      isMissingLinePreconditionError(error, currentLineId) ||
      isMissingLinePreconditionError(error, resolvedPrevLineId)
    ) {
      return;
    }

    throw error;
  } finally {
    if (!shouldReleaseLockAfterFocus) {
      store.clearLockingLineId();
    }
  }
};

export const handleSectionTabRightClick = (deps, payload) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  payload._event.preventDefault(); // Prevent default browser context menu

  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionTab", "") ||
    "";

  store.showSectionDropdownMenu({
    position: {
      x: payload._event.clientX,
      y: payload._event.clientY,
    },
    sectionId,
  });

  render();
};

export const handleActionsDialogClose = (deps) => {
  const { render } = deps;
  render();
};

export const handleDropdownMenuClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const item = payload._event.detail.item || payload._event.detail;
  const action = item?.value;
  const dropdownState = store.getState().dropdownMenu;
  const sectionId = dropdownState.sectionId;
  const actionsType = dropdownState.actionsType;
  const sceneId = store.selectSceneId();

  // Store position before hiding dropdown (for rename popover)
  const position = dropdownState.position;

  store.hideDropdownMenu();

  if (typeof action === "string" && action.startsWith("go-to-section:")) {
    const nextSectionId = action.replace("goToSection:", "");
    if (nextSectionId) {
      await selectSection(deps, nextSectionId);
      return;
    }
  }

  if (action === "delete-section") {
    await projectService.deleteSectionItem({
      sceneId,
      sectionId,
    });

    // Update store with new repository state
    syncStoreProjectState(store, projectService);

    // Update scene data and select first remaining section
    const newScene = store.selectScene();
    if (newScene && newScene.sections.length > 0) {
      store.setSelectedSectionId({
        selectedSectionId: newScene.sections[0].id,
      });
    }
  } else if (action === "rename-section") {
    // Show rename popover using the stored position
    store.showPopover({
      position,
      sectionId,
      mode: "rename-section",
      defaultName: "",
    });
  } else if (action === "delete-actions") {
    const selectedLineId = store.selectSelectedLineId();
    const selectedSectionId = store.selectSelectedSectionId();

    if (actionsType && selectedLineId && selectedSectionId) {
      // Special handling for dialogue - keep content, remove only layoutId and characterId
      if (actionsType === "dialogue") {
        const stateBefore = projectService.getState();
        const currentActions =
          stateBefore.scenes?.items?.[sceneId]?.sections?.items?.[
            selectedSectionId
          ]?.lines?.items?.[selectedLineId]?.actions;

        if (currentActions?.dialogue) {
          // Keep content if it exists, remove layoutId and characterId
          const updatedDialogue = {
            content: currentActions.dialogue.content,
          };

          await projectService.updateLineActions({
            lineId: selectedLineId,
            patch: {
              dialogue: updatedDialogue,
            },
            replace: false,
          });
        }
      } else {
        const stateBefore = projectService.getState();
        const currentActions =
          stateBefore.scenes?.items?.[sceneId]?.sections?.items?.[
            selectedSectionId
          ]?.lines?.items?.[selectedLineId]?.actions || {};
        const nextActions = structuredClone(currentActions);
        delete nextActions[actionsType];

        await projectService.updateLineActions({
          lineId: selectedLineId,
          patch: nextActions,
          replace: true,
        });
      }

      syncStoreProjectState(store, projectService);

      // Trigger re-render to update the view
      subject.dispatch("sceneEditor.renderCanvas", {});
    }
  }

  render();
};

export const handlePopoverClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleSectionCreateDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideSectionCreateDialog();
  render();
};

export const handleSectionCreateFormActionClick = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const action = detail.actionId;
  const values = detail.values || {};
  const nextSectionName = String(values.name || "").trim();

  if (action === "cancel") {
    store.hideSectionCreateDialog();
    render();
    return;
  }

  if (action === "submit") {
    store.hideSectionCreateDialog();
    if (nextSectionName) {
      await createSectionWithName(deps, nextSectionName);
      return;
    }
  }

  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload._event.detail;

  const action = detail.actionId;
  const values = detail.values;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    const popoverState = store.getState().popover || {};
    const sectionId = popoverState.sectionId;
    const popoverMode = popoverState.mode;
    const sceneId = store.selectSceneId();
    const nextSectionName = String(values?.name || "").trim();

    // Hide popover
    store.hidePopover();

    if (popoverMode === "create-section" && nextSectionName && sceneId) {
      await createSectionWithName(deps, nextSectionName);
      return;
    }

    if (sectionId && nextSectionName && sceneId) {
      await projectService.renameSectionItem({
        sceneId,
        sectionId,
        name: nextSectionName,
      });

      // Update store with new repository state
      syncStoreProjectState(store, projectService);
    }

    render();
  }
};

export const handleToggleSectionsGraphView = (deps) => {
  const { store, render } = deps;
  store.toggleSectionsGraphView();
  render();
};

export const handlePreviewClick = (deps) => {
  const { store, render } = deps;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  store.showPreviewSceneId({ sceneId, sectionId, lineId });
  render();
};

export const handleDeleteLineShortcut = async (deps, payload) => {
  const { store, subject, render, projectService, globalUI, appService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const sectionId = store.selectSelectedSectionId();

  if (!lineId || !sectionId) {
    return;
  }

  const scene = store.selectScene();
  const section = scene?.sections?.find((item) => item.id === sectionId);
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  if (currentIndex < 0) {
    return;
  }

  const dialogOptions = {
    title: "Delete Line",
    message: "Are you sure you want to delete this line?",
    confirmText: "Delete",
  };

  let confirmationResult = false;
  if (typeof globalUI?.showConfirm === "function") {
    confirmationResult = await globalUI.showConfirm(dialogOptions);
  } else if (typeof appService?.showDialog === "function") {
    confirmationResult = await appService.showDialog(dialogOptions);
  }

  const confirmed =
    typeof confirmationResult === "boolean"
      ? confirmationResult
      : !!(confirmationResult?.confirmed ?? confirmationResult?.value);
  if (!confirmed) {
    return;
  }

  const nextSelectedLineId =
    lines[currentIndex + 1]?.id || lines[currentIndex - 1]?.id;

  await flushDialogueQueue(deps);
  await projectService.deleteLineItem({ lineId });

  syncStoreProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: nextSelectedLineId });

  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleLineDeleteActionItem = async (deps, payload) => {
  const { store, subject, render, projectService } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine || !selectedLine.actions) {
    return;
  }
  // Create a new actions object without the action to delete
  const newActions = { ...selectedLine.actions };
  if (newActions.hasOwnProperty(actionType)) {
    if (actionType === "dialogue") {
      newActions[actionType] = {
        content: newActions[actionType].content,
      };
    } else {
      delete newActions[actionType];
    }
  }
  await projectService.updateLineActions({
    lineId: selectedLine.id,
    patch: newActions,
    replace: true,
  });
  // Update store with new repository state
  syncStoreProjectState(store, projectService);
  // Trigger re-render
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleHidePreviewScene = async (deps) => {
  const { store, render, graphicsService, refs } = deps;

  store.hidePreviewScene();
  render();

  const { canvas } = refs;
  resetAssetLoadCache();
  store.setSceneAssetLoading({ isLoading: false });
  const beforeHandleActions = createBeforeHandleActionsHook(deps);
  await graphicsService.init({
    canvas: canvas,
    beforeHandleActions,
  });

  const projectData = store.selectProjectData();
  const sceneId = store.selectSceneId();
  const initialProjectData = createProjectDataWithSelectedEntryPoint(
    projectData,
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
    },
  );
  const initialSceneIds = extractInitialHybridSceneIds(projectData, sceneId);
  await loadAssetsForSceneIds(deps, projectData, initialSceneIds, {
    showLoading: false,
  });
  void preloadDirectTransitionScenes(deps, projectData, initialSceneIds);
  graphicsService.initRouteEngine(initialProjectData);

  await renderSceneState(store, graphicsService);
};

// Handler for debounced canvas rendering
async function handleRenderCanvas(deps, payload) {
  const { store, graphicsService, render } = deps;
  const projectData = store.selectProjectData();
  const sceneId = store.selectSceneId();
  const sceneIdsToLoad = extractInitialHybridSceneIds(projectData, sceneId);

  await loadAssetsForSceneIds(deps, projectData, sceneIdsToLoad, {
    showLoading: false,
  });
  void preloadDirectTransitionScenes(deps, projectData, sceneIdsToLoad);

  await renderSceneState(store, graphicsService, payload);
  await updateSectionChanges(deps);

  if (!payload?.skipRender) {
    render();
  }
}

// RxJS subscriptions for handling events with throttling/debouncing
const subscriptions = (deps) => {
  const { subject, dialogueQueueService } = deps;

  // Register write callback for dialogue queue (debounce is handled by the service)
  dialogueQueueService.onWrite(async (lineId, data) => {
    await writeDialogueContent(deps, lineId, data);
  });

  return [
    // Debounce canvas renders by 50ms to prevent multiple renders on rapid navigation
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.renderCanvas"),
      debounceTime(50),
      tap(async ({ payload }) => {
        await handleRenderCanvas(deps, payload);
      }),
    ),
  ];
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  const { p } = appService.getPayload();
  appService.navigate("/project/scenes", { p });
};

export const handleSystemActionsActionDelete = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine) {
    return;
  }
  // Create a new actions object with the action cleared
  // For inherited actions (visual, character, background), we set a "clear" value
  // to override inherited state. For non-inherited actions, we delete the key.
  const newActions = structuredClone(selectedLine.actions || {});
  if (actionType === "dialogue") {
    newActions.dialogue = { clear: true };
  } else if (actionType === "visual") {
    // Clear visual by setting empty items array
    newActions.visual = { items: [] };
  } else if (actionType === "character") {
    // Clear characters by setting empty items array
    newActions.character = { items: [] };
  } else if (actionType === "background") {
    // Clear background by setting without resourceId
    newActions.background = {};
  } else if (actionType === "base") {
    // Clear base by setting without resourceId
    newActions.base = {};
  } else {
    // For non-inherited actions, delete as before
    delete newActions[actionType];
  }
  await projectService.updateLineActions({
    lineId: selectedLine.id,
    patch: newActions,
    replace: true,
  });
  // Update store with new repository state
  syncStoreProjectState(store, projectService);
  // Trigger re-render
  render();

  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleMuteToggle = (deps) => {
  const { store, render, subject } = deps;
  store.toggleMute();
  render();
  // Re-render canvas with new mute state
  subject.dispatch("sceneEditor.renderCanvas", {});
};
