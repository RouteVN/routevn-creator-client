import { toTreeStructure } from "insieme";
import { layoutTreeStructureToRenderState } from "./index.js";

export function constructProjectData(state, options = {}) {
  // Helper functions
  function constructImages(repositoryImages = {}) {
    const processedImages = {};
    Object.entries(repositoryImages).forEach(([id, item]) => {
      if (item.type === "image") {
        processedImages[id] = item;
      }
    });
    return processedImages;
  }

  function constructAudios(repositoryAudio = {}) {
    const processedAudios = {};
    Object.entries(repositoryAudio).forEach(([id, item]) => {
      if (item.type === "audio") {
        processedAudios[id] = item;
      }
    });
    return processedAudios;
  }

  function constructFonts(repositoryFonts = {}) {
    const processedFonts = {};
    Object.entries(repositoryFonts).forEach(([id, item]) => {
      if (item.type === "font") {
        processedFonts[id] = item;
      }
    });
    return processedFonts;
  }

  function constructAnimations(repositoryAnimations = {}) {
    const items = {};
    Object.entries(repositoryAnimations).forEach(([id, item]) => {
      if (item.type === "animation") {
        items[id] = {
          id,
          properties: item.properties,
        };
      }
    });
    return items;
  }

  function constructCharacters(repositoryCharacters = {}) {
    const processedCharacters = {};

    Object.keys(repositoryCharacters).forEach((characterId) => {
      const character = repositoryCharacters[characterId];
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
  }

  function constructTransforms(repositoryTransforms = {}) {
    const processedTransforms = {};

    Object.keys(repositoryTransforms).forEach((transformId) => {
      const transform = repositoryTransforms[transformId];
      if (transform.type === "transform") {
        processedTransforms[transformId] = transform;
      }
    });

    return processedTransforms;
  }

  function constructLayouts(
    repositoryLayouts = {},
    images = {},
    typography = { items: {}, tree: [] },
    colors = { items: {}, tree: [] },
    fonts = { items: {}, tree: [] },
  ) {
    const processedLayouts = {};

    Object.keys(repositoryLayouts).forEach((layoutId) => {
      const layout = repositoryLayouts[layoutId];
      if (layout.type === "layout") {
        processedLayouts[layoutId] = {
          id: layoutId,
          name: layout.name,
          layoutType: layout.layoutType,
          elements: layoutTreeStructureToRenderState(
            toTreeStructure(layout.elements),
            images,
            typography,
            colors,
            fonts,
          ),
        };
      }
    });

    return processedLayouts;
  }

  function extractCharacterImages(characters) {
    const characterImages = {};
    Object.entries(characters).forEach(([, character]) => {
      Object.assign(characterImages, character.sprites);
    });
    return characterImages;
  }

  function constructResources(repositoryState) {
    const images = repositoryState.images?.items || {};
    const audio = repositoryState.audio?.items || {};
    const animations = repositoryState.animations?.items || {};
    const characters = repositoryState.characters?.items || {};
    const transforms = repositoryState.transforms?.items || {};
    const layouts = repositoryState.layouts?.items || {};
    const typography = repositoryState.typography || { items: {}, tree: [] };
    const colors = repositoryState.colors || { items: {}, tree: [] };
    const fonts = repositoryState.fonts?.items || {};

    const processedCharacters = constructCharacters(characters);
    const characterImages = extractCharacterImages(processedCharacters);

    return {
      images: { ...constructImages(images), ...characterImages },
      transforms: constructTransforms(transforms),
      characters: processedCharacters,
      audio: constructAudios(audio),
      fonts: constructFonts(fonts),
      layouts: constructLayouts(layouts, images, typography, colors, fonts),
      animations: constructAnimations(animations),
    };
  }

  // Story construction (from storyConstructor.js)
  function constructStory(scenes) {
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
                const transformedLine = {
                  id: lineId,
                  actions: line.actions || {},
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

  function getInitialSceneId(scenes, story) {
    return options.initialSceneId || story?.initialSceneId;
  }

  // Construct final project data
  const projectData = {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
    },
    resources: constructResources(state),
    story: {
      initialSceneId: getInitialSceneId(state.scenes, state.story),
      scenes: constructStory(state.scenes),
    },
    l10n: {
      packages: {
        abcd: {
          label: "English",
          lang: "en",
          keys: {},
        },
      },
    },
  };
  return projectData;
}
