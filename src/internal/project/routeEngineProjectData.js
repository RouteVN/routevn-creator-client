const isObjectRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const EMPTY_SECTION_LINE_ID = "__empty__";

export const summarizeProjectDataForRouteEngine = (projectData) => {
  const story = isObjectRecord(projectData?.story) ? projectData.story : {};
  const scenes = isObjectRecord(story.scenes) ? story.scenes : {};
  const sceneIds = Object.keys(scenes);
  const initialScene = isObjectRecord(scenes[story.initialSceneId])
    ? scenes[story.initialSceneId]
    : undefined;
  const sections = isObjectRecord(initialScene?.sections)
    ? initialScene.sections
    : {};
  const sectionIds = Object.keys(sections);
  const initialSection = isObjectRecord(
    sections[initialScene?.initialSectionId],
  )
    ? sections[initialScene.initialSectionId]
    : undefined;
  const lines = Array.isArray(initialSection?.lines)
    ? initialSection.lines
    : [];

  return {
    initialSceneId: story.initialSceneId,
    sceneIds,
    initialSectionId: initialScene?.initialSectionId,
    sectionIds,
    initialLineId: initialSection?.initialLineId,
    lineIds: lines.map((line) => line?.id).filter(Boolean),
    lineCount: lines.length,
  };
};

export const sanitizeProjectDataForRouteEngine = (projectData) => {
  const safeProjectData = structuredClone(projectData || {});
  const changes = [];
  const story = isObjectRecord(safeProjectData.story)
    ? safeProjectData.story
    : {};
  const scenes = isObjectRecord(story.scenes) ? story.scenes : {};

  const validSceneIds = Object.entries(scenes)
    .filter(([, scene]) => isObjectRecord(scene))
    .map(([sceneId]) => sceneId);

  if (!validSceneIds.includes(story.initialSceneId)) {
    if (story.initialSceneId !== validSceneIds[0]) {
      changes.push({
        type: "initialSceneId",
        from: story.initialSceneId,
        to: validSceneIds[0],
      });
    }
    story.initialSceneId = validSceneIds[0];
  }

  for (const sceneId of validSceneIds) {
    const scene = scenes[sceneId];
    const sections = isObjectRecord(scene?.sections) ? scene.sections : {};
    const validSectionIds = Object.entries(sections)
      .filter(([, section]) => isObjectRecord(section))
      .map(([sectionId]) => sectionId);

    if (!validSectionIds.includes(scene.initialSectionId)) {
      if (scene.initialSectionId !== validSectionIds[0]) {
        changes.push({
          type: "initialSectionId",
          sceneId,
          from: scene.initialSectionId,
          to: validSectionIds[0],
        });
      }
      scene.initialSectionId = validSectionIds[0];
    }

    for (const sectionId of validSectionIds) {
      const section = sections[sectionId];
      const rawLines = Array.isArray(section?.lines) ? section.lines : [];
      const lines = rawLines.filter(
        (line) =>
          isObjectRecord(line) && typeof line.id === "string" && line.id,
      );

      if (lines.length !== rawLines.length) {
        changes.push({
          type: "invalidLines",
          sceneId,
          sectionId,
          removed: rawLines.length - lines.length,
        });
      }

      section.lines = lines;

      const validLineIds = lines.map((line) => line.id);
      if (!validLineIds.includes(section.initialLineId)) {
        const nextInitialLineId =
          validLineIds[0] ||
          (typeof section.initialLineId === "string" && section.initialLineId
            ? section.initialLineId
            : EMPTY_SECTION_LINE_ID);
        changes.push({
          type: "initialLineId",
          sceneId,
          sectionId,
          from: section.initialLineId,
          to: nextInitialLineId,
        });

        section.initialLineId = nextInitialLineId;
      }
    }
  }

  safeProjectData.story = story;

  return {
    projectData: safeProjectData,
    didSanitize: changes.length > 0,
    changes,
  };
};
