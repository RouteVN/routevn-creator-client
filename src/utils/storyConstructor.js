/**
 * Transform scenes from repository format to bundle format
 * Converts tree structures to flat arrays and removes type properties
 */
export function constructStory(scenes) {
  const transformedScenes = {};

  if (!scenes?.items) {
    return transformedScenes;
  }

  // Process each scene
  Object.entries(scenes.items).forEach(([sceneId, scene]) => {
    if (scene.type !== "scene") {
      return;
    }

    // Get first section ID from the sections
    let firstSectionId = null;
    if (scene.sections?.tree && scene.sections.tree.length > 0) {
      const firstSection = scene.sections.tree[0];
      firstSectionId =
        typeof firstSection === "string" ? firstSection : firstSection.id;
    }

    const transformedScene = {
      name: scene.name,
      initialSectionId: firstSectionId, // Default to first section
      sections: {},
    };

    // Process sections
    if (scene.sections?.items) {
      Object.entries(scene.sections.items).forEach(([sectionId, section]) => {
        // Don't check for type since sections don't have type property
        const transformedSection = {
          name: section.name || "Unnamed Section",
          lines: [],
        };

        // Convert lines from tree structure to flat array
        if (section.lines?.tree && section.lines?.items) {
          // Use tree order to maintain line sequence
          section.lines.tree.forEach((lineNode) => {
            const lineId =
              typeof lineNode === "string" ? lineNode : lineNode.id;
            const line = section.lines.items[lineId];
            if (line) {
              // Transform line structure - rename 'presentation' to 'actions'
              const transformedLine = {
                id: lineId,
                actions: line.presentation || {},
              };
              transformedSection.lines.push(transformedLine);
            }
          });
        }

        transformedScene.sections[sectionId] = transformedSection;
      });
    }

    transformedScenes[sceneId] = transformedScene;
  });

  return transformedScenes;
}

/**
 * Get the initial scene ID - always returns "scene-prologue"
 */
export function getInitialSceneId() {
  return "scene-prologue";
}
