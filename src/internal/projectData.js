import {
  buildLayoutElements,
  createLayoutReferenceResources,
} from "./project/layout.js";
import { normalizeEngineActions } from "./project/engineActions.js";
import { toHierarchyStructure } from "./project/tree.js";

const pickResourceFields = (item, fields) => {
  return fields.reduce((result, fieldName) => {
    if (item?.[fieldName] !== undefined) {
      result[fieldName] = item[fieldName];
    }
    return result;
  }, {});
};

const constructImageResources = (repositoryImages = {}) => {
  return Object.entries(repositoryImages).reduce((result, [imageId, item]) => {
    if (item?.type && item.type !== "image") {
      return result;
    }
    if (!item?.fileId) {
      return result;
    }

    result[imageId] = pickResourceFields(item, [
      "fileId",
      "fileType",
      "width",
      "height",
    ]);
    return result;
  }, {});
};

const constructVideoResources = (repositoryVideos = {}) => {
  return Object.entries(repositoryVideos).reduce((result, [videoId, item]) => {
    if (item?.type !== "video" || !item.fileId) {
      return result;
    }

    result[videoId] = pickResourceFields(item, [
      "fileId",
      "fileType",
      "width",
      "height",
    ]);
    return result;
  }, {});
};

const constructSoundResources = (repositorySounds = {}) => {
  return Object.entries(repositorySounds).reduce((result, [soundId, item]) => {
    if (item?.type !== "sound" || !item.fileId) {
      return result;
    }

    result[soundId] = pickResourceFields(item, ["fileId", "fileType"]);
    return result;
  }, {});
};

const constructTweenResources = (repositoryTweens = {}) => {
  return Object.entries(repositoryTweens).reduce((result, [tweenId, item]) => {
    if (item?.type !== "tween") {
      return result;
    }

    result[tweenId] = {
      properties: item.properties,
    };
    return result;
  }, {});
};

const constructCharacterResources = (repositoryCharacters = {}) => {
  return Object.entries(repositoryCharacters).reduce(
    (result, [characterId, character]) => {
      if (character?.type !== "character") {
        return result;
      }

      result[characterId] = {
        name: character.name,
        variables: {
          name: character.name || "Unnamed Character",
        },
      };
      return result;
    },
    {},
  );
};

const constructTransformResources = (repositoryTransforms = {}) => {
  return Object.entries(repositoryTransforms).reduce(
    (result, [transformId, transform]) => {
      if (transform?.type !== "transform") {
        return result;
      }

      result[transformId] = pickResourceFields(transform, [
        "x",
        "y",
        "anchorX",
        "anchorY",
        "scaleX",
        "scaleY",
        "rotation",
      ]);
      return result;
    },
    {},
  );
};

const extractCharacterImages = (repositoryCharacters = {}) => {
  return Object.entries(repositoryCharacters).reduce(
    (result, [, character]) => {
      if (character?.type !== "character" || !character.sprites?.items) {
        return result;
      }

      Object.entries(character.sprites.items).forEach(([spriteId, sprite]) => {
        if (!sprite?.fileId) {
          return;
        }

        result[spriteId] = pickResourceFields(sprite, [
          "fileId",
          "fileType",
          "width",
          "height",
        ]);
      });

      return result;
    },
    {},
  );
};

const constructLayoutResources = (
  repositoryLayouts = {},
  imageItems = {},
  typography = { items: {}, tree: [] },
  colors = { items: {}, tree: [] },
  fonts = { items: {}, tree: [] },
) => {
  const baseLayoutResources = createLayoutReferenceResources(
    imageItems,
    typography,
    colors,
    fonts,
  );
  const textStyles = {
    ...baseLayoutResources.textStyles,
  };
  const layouts = {};

  Object.entries(repositoryLayouts).forEach(([layoutId, layout]) => {
    if (layout?.type !== "layout") {
      return;
    }

    const { elements, resources } = buildLayoutElements(
      toHierarchyStructure(layout.elements),
      imageItems,
      typography,
      colors,
      fonts,
      { layoutId },
    );

    Object.assign(textStyles, resources.textStyles);

    layouts[layoutId] = {
      id: layoutId,
      name: layout.name,
      layoutType: layout.layoutType,
      elements,
      ...(Array.isArray(layout.transitions)
        ? { transitions: structuredClone(layout.transitions) }
        : {}),
    };
  });

  return {
    resources: {
      images: baseLayoutResources.images,
      colors: baseLayoutResources.colors,
      fonts: baseLayoutResources.fonts,
      textStyles,
    },
    layouts,
  };
};

const constructProjectResources = (repositoryState = {}) => {
  const repositoryImages = repositoryState.images?.items || {};
  const repositoryVideos = repositoryState.videos?.items || {};
  const repositorySounds = repositoryState.sounds?.items || {};
  const repositoryTweens = repositoryState.tweens?.items || {};
  const repositoryCharacters = repositoryState.characters?.items || {};
  const repositoryTransforms = repositoryState.transforms?.items || {};
  const repositoryLayouts = repositoryState.layouts?.items || {};
  const typography = repositoryState.typography || { items: {}, tree: [] };
  const colors = repositoryState.colors || { items: {}, tree: [] };
  const fonts = repositoryState.fonts || { items: {}, tree: [] };
  const variables = Object.fromEntries(
    Object.entries(repositoryState.variables?.items || {}).filter(
      ([, item]) => item.type !== "folder",
    ),
  );

  const characterImages = extractCharacterImages(repositoryCharacters);
  const imageItems = {
    ...constructImageResources(repositoryImages),
    ...characterImages,
  };
  const { resources: layoutResources, layouts } = constructLayoutResources(
    repositoryLayouts,
    imageItems,
    typography,
    colors,
    fonts,
  );

  return {
    images: layoutResources.images,
    videos: constructVideoResources(repositoryVideos),
    sounds: constructSoundResources(repositorySounds),
    fonts: layoutResources.fonts,
    colors: layoutResources.colors,
    textStyles: layoutResources.textStyles,
    transforms: constructTransformResources(repositoryTransforms),
    characters: constructCharacterResources(repositoryCharacters),
    layouts,
    tweens: constructTweenResources(repositoryTweens),
    variables,
  };
};

const constructStory = (scenes) => {
  const transformedScenes = {};

  if (!scenes?.items) {
    return transformedScenes;
  }

  Object.entries(scenes.items).forEach(([sceneId, scene]) => {
    if (scene.type !== "scene") {
      return;
    }

    let firstSectionId;
    if (scene.sections?.tree && scene.sections.tree.length > 0) {
      const firstSection = scene.sections.tree[0];
      firstSectionId =
        typeof firstSection === "string" ? firstSection : firstSection.id;
    }

    const transformedScene = {
      name: scene.name,
      initialSectionId: firstSectionId,
      sections: {},
    };

    if (scene.sections?.items) {
      Object.entries(scene.sections.items).forEach(([sectionId, section]) => {
        const transformedSection = {
          name: section.name || "Unnamed Section",
          lines: [],
        };

        if (section.lines?.tree && section.lines?.items) {
          section.lines.tree.forEach((lineNode) => {
            const lineId =
              typeof lineNode === "string" ? lineNode : lineNode.id;
            const line = section.lines.items[lineId];
            if (!line) {
              return;
            }

            transformedSection.lines.push({
              id: lineId,
              actions: normalizeEngineActions(line.actions || {}),
            });
          });
        }

        transformedScene.sections[sectionId] = transformedSection;
      });
    }

    transformedScenes[sceneId] = transformedScene;
  });

  return transformedScenes;
};

export function constructProjectData(state, options = {}) {
  return {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
    },
    resources: constructProjectResources(state),
    story: {
      initialSceneId: options.initialSceneId || state.story?.initialSceneId,
      scenes: constructStory(state.scenes),
    },
  };
}
