import {
  areContentsEqual,
  getLineDialogueContent,
  setLineDialogueContent,
} from "./contentModel.js";

const clonePlainValue = (value) => {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clonePlainValue(item));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, clonePlainValue(item)])
      .filter(([, item]) => item !== undefined),
  );
};

export const cloneSceneEditorLine = (line) => {
  const sourceLine = line || {};

  try {
    return structuredClone(sourceLine);
  } catch (error) {
    if (error?.name !== "DataCloneError") {
      throw error;
    }
  }

  return {
    id: sourceLine.id,
    sectionId: sourceLine.sectionId,
    actions: clonePlainValue(sourceLine.actions || {}),
  };
};

export const cloneSceneEditorLines = (lines = []) => {
  return (Array.isArray(lines) ? lines : [])
    .filter((line) => typeof line?.id === "string" && line.id)
    .map((line) => cloneSceneEditorLine(line));
};

const getSectionLines = (section) => {
  return Array.isArray(section?.lines) ? section.lines : [];
};

export const createSceneEditorDraftSection = ({
  sceneId,
  sectionId,
  section,
  revision = 0,
} = {}) => {
  return {
    sceneId,
    sectionId,
    baseRevision: Number.isFinite(revision) ? revision : 0,
    lines: cloneSceneEditorLines(getSectionLines(section)),
    dirty: false,
    isComposing: false,
    lastSource: "repository",
  };
};

export const ensureSceneEditorDraftSection = ({
  draftSection,
  sceneId,
  sectionId,
  section,
  revision = 0,
} = {}) => {
  if (!sceneId || !sectionId) {
    return undefined;
  }

  if (
    draftSection?.sceneId === sceneId &&
    draftSection?.sectionId === sectionId &&
    draftSection?.dirty
  ) {
    return draftSection;
  }

  if (
    draftSection?.sceneId === sceneId &&
    draftSection?.sectionId === sectionId &&
    !draftSection?.dirty
  ) {
    const repositoryLines = cloneSceneEditorLines(getSectionLines(section));
    return {
      ...draftSection,
      baseRevision: Number.isFinite(revision)
        ? revision
        : draftSection.baseRevision,
      lines: repositoryLines,
      lastSource: "repository",
    };
  }

  return createSceneEditorDraftSection({
    sceneId,
    sectionId,
    section,
    revision,
  });
};

export const replaceSceneEditorDraftSectionLines = (
  draftSection,
  { lines, source = "editor", dirty = true } = {},
) => {
  if (!draftSection) {
    return draftSection;
  }

  return {
    ...draftSection,
    lines: cloneSceneEditorLines(lines),
    dirty: dirty === true,
    lastSource: source,
  };
};

export const setSceneEditorDraftSectionCompositionState = (
  draftSection,
  { isComposing } = {},
) => {
  if (!draftSection) {
    return draftSection;
  }

  return {
    ...draftSection,
    isComposing: isComposing === true,
  };
};

export const markSceneEditorDraftSectionClean = (
  draftSection,
  { revision } = {},
) => {
  if (!draftSection) {
    return draftSection;
  }

  return {
    ...draftSection,
    dirty: false,
    baseRevision: Number.isFinite(revision)
      ? revision
      : draftSection.baseRevision,
    lastSource: "repository",
  };
};

export const rebaseSceneEditorDraftSection = (
  draftSection,
  { revision } = {},
) => {
  if (!draftSection) {
    return draftSection;
  }

  return {
    ...draftSection,
    dirty: true,
    baseRevision: Number.isFinite(revision)
      ? revision
      : draftSection.baseRevision,
  };
};

export const hasPendingSceneEditorDraftChanges = (draftSection) => {
  return Boolean(draftSection?.dirty);
};

export const overlaySceneWithDraftSection = (scene, draftSection) => {
  if (!scene || !draftSection || scene.id !== draftSection.sceneId) {
    return scene;
  }

  return {
    ...scene,
    sections: (Array.isArray(scene.sections) ? scene.sections : []).map(
      (section) => {
        if (section.id !== draftSection.sectionId) {
          return section;
        }

        return {
          ...section,
          lines: cloneSceneEditorLines(draftSection.lines),
        };
      },
    ),
  };
};

export const areSceneEditorLinesEqual = (leftLines = [], rightLines = []) => {
  if (leftLines.length !== rightLines.length) {
    return false;
  }

  for (let index = 0; index < leftLines.length; index += 1) {
    const leftLine = leftLines[index];
    const rightLine = rightLines[index];

    if (
      leftLine?.id !== rightLine?.id ||
      leftLine?.sectionId !== rightLine?.sectionId
    ) {
      return false;
    }

    if (
      !areContentsEqual(
        getLineDialogueContent(leftLine),
        getLineDialogueContent(rightLine),
      )
    ) {
      return false;
    }

    const leftLineClone = cloneSceneEditorLine(leftLine);
    const rightLineClone = cloneSceneEditorLine(rightLine);
    setLineDialogueContent(leftLineClone, []);
    setLineDialogueContent(rightLineClone, []);

    if (JSON.stringify(leftLineClone) !== JSON.stringify(rightLineClone)) {
      return false;
    }
  }

  return true;
};
