import { constructProjectData } from "../../../internal/project/projection.js";

const toElementList = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
};

const collectIdsByKey = (value, keyName, ids) => {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      collectIdsByKey(item, keyName, ids);
    });
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    if (key === keyName && typeof entry === "string" && entry.length > 0) {
      ids.add(entry);
    }

    collectIdsByKey(entry, keyName, ids);
  });
};

const collectIdsFromValueByKey = (keyName, values) => {
  const ids = new Set();

  toElementList(values).forEach((value) => {
    collectIdsByKey(value, keyName, ids);
  });

  return Array.from(ids);
};

export const collectSceneIdsFromValue = (...values) => {
  return collectIdsFromValueByKey("sceneId", values);
};

export const collectSectionIdsFromValue = (...values) => {
  return collectIdsFromValueByKey("sectionId", values);
};

export const resolveSceneIdForSectionId = (projectData, sectionId) => {
  if (!sectionId) {
    return undefined;
  }

  const scenes = projectData?.story?.scenes || {};
  for (const [sceneId, scene] of Object.entries(scenes)) {
    if (scene?.sections?.[sectionId]) {
      return sceneId;
    }
  }

  return undefined;
};

export const hasPreviewSceneLines = (projectData, sceneId) => {
  if (!sceneId) {
    return false;
  }

  const sections = projectData?.story?.scenes?.[sceneId]?.sections || {};
  return Object.values(sections).some(
    (section) => Array.isArray(section?.lines) && section.lines.length > 0,
  );
};

export const hasPreviewSectionLines = (projectData, sectionId) => {
  const sceneId = resolveSceneIdForSectionId(projectData, sectionId);
  if (!sceneId) {
    return false;
  }

  const lines =
    projectData?.story?.scenes?.[sceneId]?.sections?.[sectionId]?.lines;
  return Array.isArray(lines) && lines.length > 0;
};

export const collectPreviewMissingTargets = ({
  projectData,
  loadedSceneIds = [],
  sceneIds = [],
  sectionIds = [],
} = {}) => {
  const knownLoadedSceneIds = new Set(
    Array.from(new Set(loadedSceneIds)).filter(Boolean),
  );
  const missingSceneIds = new Set();
  const missingSectionIds = new Set();

  Array.from(new Set(sceneIds)).forEach((sceneId) => {
    if (!sceneId) {
      return;
    }

    if (
      !knownLoadedSceneIds.has(sceneId) ||
      !hasPreviewSceneLines(projectData, sceneId)
    ) {
      missingSceneIds.add(sceneId);
    }
  });

  Array.from(new Set(sectionIds)).forEach((sectionId) => {
    if (!sectionId) {
      return;
    }

    const sceneId = resolveSceneIdForSectionId(projectData, sectionId);
    if (!sceneId) {
      missingSectionIds.add(sectionId);
      return;
    }

    if (!hasPreviewSectionLines(projectData, sectionId)) {
      missingSectionIds.add(sectionId);
      missingSceneIds.add(sceneId);
      return;
    }

    if (
      !knownLoadedSceneIds.has(sceneId) ||
      !hasPreviewSceneLines(projectData, sceneId)
    ) {
      missingSceneIds.add(sceneId);
    }
  });

  return {
    missingSceneIds: Array.from(missingSceneIds),
    missingSectionIds: Array.from(missingSectionIds),
  };
};

export const withPreviewEntryPoint = (
  projectData,
  { sceneId, sectionId, lineId } = {},
) => {
  const nextProjectData = structuredClone(projectData);
  const scene = nextProjectData?.story?.scenes?.[sceneId];

  if (!scene) {
    return nextProjectData;
  }

  nextProjectData.story.initialSceneId = sceneId;

  if (!sectionId || sectionId === "undefined" || !scene.sections?.[sectionId]) {
    return nextProjectData;
  }

  scene.initialSectionId = sectionId;

  if (lineId && lineId !== "undefined" && scene.sections[sectionId]) {
    scene.sections[sectionId].initialLineId = lineId;
  }

  return nextProjectData;
};

export const ensurePreviewProjectDataTargets = async ({
  repository,
  projectData,
  loadedSceneIds = [],
  sceneIds = [],
  sectionIds = [],
  initialSceneId,
  initialSectionId,
  initialLineId,
} = {}) => {
  const knownLoadedSceneIds = Array.from(new Set(loadedSceneIds)).filter(
    Boolean,
  );
  const nextSceneIds = Array.from(new Set(sceneIds)).filter(Boolean);
  const nextSectionIds = Array.from(new Set(sectionIds)).filter(Boolean);
  const missingSceneIds = nextSceneIds.filter(
    (sceneId) =>
      !knownLoadedSceneIds.includes(sceneId) ||
      !hasPreviewSceneLines(projectData, sceneId),
  );

  if (missingSceneIds.length === 0 && nextSectionIds.length === 0) {
    return {
      projectData,
      missingSceneIds,
      missingSectionIds: [],
      loadedSceneIds: knownLoadedSceneIds,
      didLoad: false,
    };
  }

  const contextState = await repository.getContextState({
    sceneIds: [...new Set([...knownLoadedSceneIds, ...missingSceneIds])],
    sectionIds: nextSectionIds,
  });
  const nextProjectData = withPreviewEntryPoint(
    constructProjectData(contextState, {
      initialSceneId,
    }),
    {
      sceneId: initialSceneId,
      sectionId: initialSectionId,
      lineId: initialLineId,
    },
  );
  const nextLoadedSceneIds = new Set([
    ...knownLoadedSceneIds,
    ...missingSceneIds,
  ]);

  nextSectionIds.forEach((sectionId) => {
    const resolvedSceneId = resolveSceneIdForSectionId(
      nextProjectData,
      sectionId,
    );
    if (resolvedSceneId) {
      nextLoadedSceneIds.add(resolvedSceneId);
    }
  });

  return {
    projectData: nextProjectData,
    missingSceneIds,
    missingSectionIds: nextSectionIds,
    loadedSceneIds: Array.from(nextLoadedSceneIds),
    didLoad: true,
  };
};
