import { toTreeStructure } from "../deps/repository";
import { layoutTreeStructureToRenderState } from "./index.js";

export function constructImages(repositoryImages = {}) {
  const processedImages = {};
  Object.entries(repositoryImages).forEach(([id, item]) => {
    if (item.type === "image") {
      processedImages[id] = item;
    }
  });
  return processedImages;
}

export function constructAudios(repositoryAudio = {}) {
  const processedAudios = {};
  Object.entries(repositoryAudio).forEach(([id, item]) => {
    if (item.type === "audio") {
      processedAudios[id] = item;
    }
  });
  return processedAudios;
}

export function constructFonts(repositoryFonts = {}) {
  const processedFonts = {};
  Object.entries(repositoryFonts).forEach(([id, item]) => {
    if (item.type === "font") {
      processedFonts[id] = item;
    }
  });
  return processedFonts;
}

export function constructAnimations(repositoryAnimations = {}) {
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

export function constructCharacters(repositoryCharacters = {}) {
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

export function constructTransforms(repositoryTransforms = {}) {
  const processedTransforms = {};

  Object.keys(repositoryTransforms).forEach((transformId) => {
    const transform = repositoryTransforms[transformId];
    if (transform.type === "transform") {
      processedTransforms[transformId] = transform;
    }
  });

  return processedTransforms;
}

export function constructLayouts(
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

export function extractCharacterImages(characters) {
  const characterImages = {};
  Object.entries(characters).forEach(([, character]) => {
    Object.assign(characterImages, character.sprites);
  });
  return characterImages;
}

export function constructResources(repositoryState) {
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
