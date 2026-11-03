// Writes the reference asset packages in tests/compat/asset-package/: small
// source projects built here, each exported with the app's own export code
// into the files its ZIP holds. The output is deterministic, so a test can
// build the packages again and require the committed files to match.
//
//   bun run generate:asset-package-fixtures
//
// See tests/compat/asset-package/README.md before changing a package.
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { createAssetPackageExportService } from "../src/deps/services/shared/assetPackageExportService.js";
import { createCommandApiShared } from "../src/deps/services/shared/commandApi/shared.js";
import {
  assertSupportedProjectState,
  createProjectRepository,
} from "../src/deps/services/shared/projectRepository.js";
import {
  ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE,
  ASSET_PACKAGE_RESOURCE_TYPES,
  ASSET_PACKAGE_SCHEMA_VERSION,
} from "../src/internal/assetPackageResources.js";
import {
  createInitialState,
  selectAssetPackageData,
  setAssetPackage,
  setFilesData,
  setResourceData,
  setScenesData,
} from "../src/pages/assetPackage/assetPackage.store.js";
import { createAssetPackageManifest } from "../src/pages/assetPackage/support/assetPackageManifest.js";

export const ASSET_PACKAGE_FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/compat/asset-package",
);
export const ASSET_PACKAGE_MANIFEST_PATH = "asset-package.json";

// A package's folder is named after its schema: routevn.import-pack.v2 is v2.
export const getAssetPackageFixtureVersion = (schema) =>
  /^routevn\.import-pack\.(v\d+)$/.exec(schema)[1];

const fromBase64 = (value) => new Uint8Array(Buffer.from(value, "base64"));
const fromText = (value) => new TextEncoder().encode(value);

// 1x1 PNGs, one color each, so every image file has its own bytes.
const PNG = {
  red: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4Y2wMAAMBATPEwnsTAAAAAElFTkSuQmCC",
  ),
  green: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwnmkMAAICAQBMZk8dAAAAAElFTkSuQmCC",
  ),
  blue: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwDj0DAAITAVVDz+ihAAAAAElFTkSuQmCC",
  ),
  gray: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC",
  ),
  gold: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4u0oJAAQRAaqD7TvJAAAAAElFTkSuQmCC",
  ),
  purple: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPocFkFAALOAXesW+ROAAAAAElFTkSuQmCC",
  ),
  teal: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQmjkTAAI1AVV/P8/UAAAAAElFTkSuQmCC",
  ),
  orange: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4V64EAAPeAYh2YDFVAAAAAElFTkSuQmCC",
  ),
  pink: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN417EKAASIAiH/BhvsAAAAAElFTkSuQmCC",
  ),
  brown: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMoDzUGAAJGAQCKKZ6iAAAAAElFTkSuQmCC",
  ),
  white: fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  ),
};

// An 8 kHz, 8-bit mono WAV of a few samples.
const createWavBytes = (samples) => {
  const view = new DataView(new ArrayBuffer(44 + samples.length));
  const writeTag = (offset, tag) => {
    for (const [index, char] of [...tag].entries()) {
      view.setUint8(offset + index, char.charCodeAt(0));
    }
  };
  writeTag(0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeTag(36, "data");
  view.setUint32(40, samples.length, true);
  samples.forEach((sample, index) => view.setUint8(44 + index, sample));
  return new Uint8Array(view.buffer);
};

// A TrueType header with no tables: enough to read as a font file, which is
// all the packages need.
const createFontBytes = (marker) =>
  new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...fromText(marker)]);

// The start of an MP4: its file type box.
const MP4 = new Uint8Array([
  0,
  0,
  0,
  24,
  ...fromText("ftypisom"),
  0,
  0,
  2,
  0,
  ...fromText("isommp41"),
]);

const WAVEFORM_JSON = fromText(
  JSON.stringify({ amplitudes: [0, 128, 255, 128], duration: 0.001 }),
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const file = (id, mimeType, bytes) => ({ id, mimeType, bytes });

// A folder or resource of a type's tree; a folder lists its children.
const folder = (id, name, children = []) => ({
  id,
  data: { type: "folder", name },
  children,
});
const item = (id, data) => ({ id, data });

const scene = (id, name, sections) => ({ id, name, sections });
const section = (id, name) => ({ id, name });

const ELEMENT_BASE = Object.freeze({
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
});
const element = (id, data) => ({ id, ...ELEMENT_BASE, ...data });
const elements = (...items) => ({
  items: Object.fromEntries(items.map((entry) => [entry.id, entry])),
  tree: items.map((entry) => ({ id: entry.id, children: [] })),
});
const actions = (value) => ({ payload: { actions: value } });

const SPRITESHEET_ATLAS = Object.freeze({
  sheetWidth: 2,
  sheetHeight: 1,
  frameCount: 2,
  width: 1,
  height: 1,
  jsonData: {
    frames: {
      "frame-0": { frame: { x: 0, y: 0, w: 1, h: 1 } },
      "frame-1": { frame: { x: 1, y: 0, w: 1, h: 1 } },
    },
    meta: { image: "spritesheet-one.png", size: { w: 2, h: 1 } },
  },
  animations: { idle: { frames: [0, 1], fps: 12, loop: true } },
});

// Every resource type the export supports, each in a picked folder, with
// references only between the picks.
const ALL_TYPES_CASE = {
  name: "all-types",
  files: [
    file("file-image-one", "image/png", PNG.red),
    file("file-image-one-thumbnail", "image/png", PNG.gray),
    file("file-image-two", "image/png", PNG.green),
    file("file-sound-one", "audio/wav", createWavBytes([128, 160, 128, 96])),
    file("file-sound-one-waveform", "application/json", WAVEFORM_JSON),
    file("file-video-one", "video/mp4", MP4),
    file("file-video-one-thumbnail", "image/png", PNG.blue),
    file("file-spritesheet-one", "image/png", PNG.gold),
    file("file-font-one", "font/ttf", createFontBytes("Font One")),
    file("file-character-one", "image/png", PNG.purple),
    file("file-sprite-one", "image/png", PNG.teal),
    file("file-thumbnail-one", "image/png", PNG.orange),
  ],
  scenes: [],
  resources: {
    images: [
      folder("folder-images", "Images", [
        item("image-one", {
          type: "image",
          name: "Image One",
          description: "A red pixel",
          fileId: "file-image-one",
          thumbnailFileId: "file-image-one-thumbnail",
          width: 1,
          height: 1,
        }),
        folder("folder-images-nested", "Backgrounds", [
          item("image-two", {
            type: "image",
            name: "Image Two",
            fileId: "file-image-two",
            width: 1,
            height: 1,
          }),
        ]),
      ]),
    ],
    sounds: [
      folder("folder-sounds", "Sounds", [
        item("sound-one", {
          type: "sound",
          name: "Sound One",
          fileId: "file-sound-one",
          waveformDataFileId: "file-sound-one-waveform",
          duration: 0.5,
        }),
      ]),
    ],
    videos: [
      folder("folder-videos", "Videos", [
        item("video-one", {
          type: "video",
          name: "Video One",
          fileId: "file-video-one",
          thumbnailFileId: "file-video-one-thumbnail",
          width: 1,
          height: 1,
        }),
      ]),
    ],
    spritesheets: [
      folder("folder-spritesheets", "Spritesheets", [
        item("spritesheet-one", {
          type: "spritesheet",
          name: "Spritesheet One",
          fileId: "file-spritesheet-one",
          ...structuredClone(SPRITESHEET_ATLAS),
        }),
      ]),
    ],
    colors: [
      folder("folder-colors", "Colors", [
        item("color-one", { type: "color", name: "Color One", hex: "#CC3333" }),
        item("color-two", { type: "color", name: "Color Two", hex: "#3355CC" }),
      ]),
    ],
    fonts: [
      folder("folder-fonts", "Fonts", [
        item("font-one", {
          type: "font",
          name: "Font One",
          fileId: "file-font-one",
          fontFamily: "Font One",
        }),
      ]),
    ],
    variables: [
      folder("folder-variables", "Variables", [
        item("variableScore", {
          type: "variable",
          variableType: "number",
          name: "Score",
          scope: "context",
          default: 0,
          value: 0,
        }),
        item("variable-name", {
          type: "variable",
          variableType: "string",
          name: "Player Name",
          scope: "context",
          default: "",
          value: "",
        }),
        item("variable-rank", {
          type: "variable",
          variableType: "string",
          name: "Rank",
          computed: {
            branches: [
              {
                when: { gte: [{ var: "variables.variableScore" }, 3] },
                expr: "High",
              },
            ],
            default: { expr: { var: 'variables["variable-name"]' } },
            examples: [
              {
                id: "example-high",
                name: "High",
                input: {
                  variables: { variableScore: 5, "variable-name": "Ann" },
                },
              },
            ],
          },
        }),
      ]),
    ],
    textStyles: [
      folder("folder-text-styles", "Text Styles", [
        item("text-style-one", {
          type: "textStyle",
          name: "Text Style One",
          fontId: ["font-one"],
          colorId: "color-one",
          strokeColorId: "color-two",
          strokeAlpha: 1,
          strokeWidth: 2,
          fontSize: 24,
          lineHeight: 1.5,
          fontWeight: "400",
          shadow: {
            colorId: "color-two",
            alpha: 0.5,
            blur: 2,
            offsetX: 1,
            offsetY: 1,
          },
        }),
      ]),
    ],
    characters: [
      folder("folder-characters", "Characters", [
        item("character-one", {
          type: "character",
          name: "Character One",
          fileId: "file-character-one",
          nameVariableId: "variable-name",
          sprites: {
            items: {
              "sprite-folder-one": {
                id: "sprite-folder-one",
                type: "folder",
                name: "Poses",
              },
              "sprite-one": {
                id: "sprite-one",
                type: "image",
                name: "Sprite One",
                fileId: "file-sprite-one",
                width: 1,
                height: 1,
              },
            },
            tree: [
              {
                id: "sprite-folder-one",
                children: [{ id: "sprite-one", children: [] }],
              },
            ],
          },
        }),
      ]),
    ],
    transforms: [
      folder("folder-transforms", "Transforms", [
        item("transform-one", {
          type: "transform",
          name: "Transform One",
          x: 640,
          y: 360,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: 0,
          thumbnailFileId: "file-thumbnail-one",
          preview: {
            background: { imageId: "image-two" },
            target: { imageId: "image-one" },
          },
        }),
        item("transform-two", {
          type: "transform",
          name: "Transform Two",
          x: 640,
          y: 720,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0.5,
          anchorY: 1,
          rotation: 0,
          preview: {
            target: {
              characterId: "character-one",
              sprites: [{ id: "sprite-group-body", resourceId: "sprite-one" }],
            },
          },
        }),
      ]),
    ],
    animations: [
      folder("folder-animations", "Animations", [
        item("animation-one", {
          type: "animation",
          name: "Animation One",
          preview: {
            background: { imageId: "image-two" },
            incoming: { imageId: "image-one" },
          },
          animation: {
            type: "update",
            tween: { alpha: { keyframes: [{ duration: 100, value: 1 }] } },
          },
        }),
      ]),
    ],
    audioEffects: [
      folder("folder-audio-effects", "Audio Effects", [
        item("audio-effect-one", {
          type: "audioEffect",
          name: "Audio Effect One",
          preview: {
            outgoing: { soundId: "sound-one" },
            incoming: { soundId: "sound-one" },
          },
          audioEffect: {
            type: "transition",
            prev: {
              volume: {
                initialValue: 100,
                keyframes: [{ value: 0, duration: 200, easing: "linear" }],
              },
            },
            next: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 100, duration: 200, easing: "linear" }],
              },
            },
          },
        }),
      ]),
    ],
    particles: [
      folder("folder-particles", "Particles", [
        item("particle-one", {
          type: "particle",
          name: "Particle One",
          width: 1280,
          height: 720,
          seed: 7,
          modules: {
            emission: {
              mode: "continuous",
              rate: 10,
              particleLifetime: { min: 1, max: 2 },
              source: {
                kind: "rect",
                data: { x: 0, y: 0, width: 1280, height: 20 },
              },
            },
            appearance: { texture: "image-one" },
          },
          preview: { background: { imageId: "image-two" } },
        }),
        item("particle-two", {
          type: "particle",
          name: "Particle Two",
          width: 1280,
          height: 720,
          seed: 11,
          modules: {
            emission: {
              mode: "continuous",
              rate: 5,
              particleLifetime: { min: 1, max: 2 },
              source: { kind: "point", data: { x: 640, y: 360 } },
            },
            appearance: {
              texture: { items: [{ src: "image-one" }, { src: "image-two" }] },
            },
          },
        }),
      ]),
    ],
    layouts: [
      folder("folder-layouts", "Layouts", [
        item("layout-one", {
          type: "layout",
          name: "Layout One",
          layoutType: "general",
          thumbnailFileId: "file-thumbnail-one",
          preview: {
            backgroundImageId: "image-two",
            variables: { variableScore: 2 },
            dialogue: {
              characterId: "character-one",
              character: {
                name: "Character One",
                sprite: {
                  transformId: "transform-one",
                  items: [{ id: "base", resourceId: "sprite-one" }],
                },
              },
              content: [{ text: "Hello" }],
            },
          },
          elements: elements(
            element("element-sprite", {
              type: "sprite",
              name: "Button",
              imageId: "image-one",
              hoverImageId: "image-two",
              clickSoundId: "sound-one",
              $when: 'dialogue.characterId == "character-one"',
              click: actions({
                updateVariable: {
                  id: "update-score",
                  operations: [
                    {
                      id: "operation-one",
                      variableId: "variableScore",
                      op: "increment",
                      value: 1,
                    },
                  ],
                },
              }),
            }),
            element("element-title", {
              type: "text",
              name: "Title",
              text: "Title",
              textStyleId: "text-style-one",
              conditionalOverrides: [
                {
                  when: {
                    target: "variables.variableScore",
                    op: "eq",
                    value: 3,
                  },
                  set: { textStyleId: "text-style-one" },
                },
                {
                  when: {
                    target: "dialogue.characterId",
                    op: "eq",
                    value: "character-one",
                  },
                  set: { opacity: 0.5 },
                },
              ],
            }),
            element("element-name", {
              type: "text",
              name: "Name",
              textStyleId: "text-style-one",
              $when:
                '(variables["variable-name"] == "Ann") && (variables.variableScore == 3)',
              content: [
                { text: "Hello, " },
                { reference: { resourceId: "variable-name" } },
              ],
            }),
            element("element-idle", {
              type: "spritesheet-animation",
              name: "Idle",
              resourceId: "spritesheet-one",
              animationName: "idle",
            }),
            element("element-particle", {
              type: "particle",
              name: "Sparkles",
              particleId: "particle-one",
            }),
            element("element-slider", {
              type: "slider",
              name: "Volume",
              width: 200,
              height: 20,
              barImageId: "image-two",
              thumbImageId: "image-one",
              variableId: "variableScore",
              min: 0,
              max: 10,
              step: 1,
            }),
          ),
        }),
      ]),
    ],
    controls: [
      folder("folder-controls", "Controls", [
        item("control-one", {
          type: "control",
          name: "Control One",
          thumbnailFileId: "file-thumbnail-one",
          keyboard: { enter: actions({ nextLine: {} }) },
          elements: elements(
            element("element-menu", {
              type: "sprite",
              name: "Menu",
              imageId: "image-one",
              click: actions({ pushOverlay: { resourceId: "layout-one" } }),
            }),
          ),
        }),
      ]),
    ],
  },
  picks: {
    images: ["folder-images"],
    sounds: ["folder-sounds"],
    videos: ["folder-videos"],
    characters: ["folder-characters"],
    transforms: ["folder-transforms"],
    animations: ["folder-animations"],
    audioEffects: ["folder-audio-effects"],
    particles: ["folder-particles"],
    spritesheets: ["folder-spritesheets"],
    colors: ["folder-colors"],
    fonts: ["folder-fonts"],
    textStyles: ["folder-text-styles"],
    layouts: ["folder-layouts"],
    variables: ["folder-variables"],
    controls: ["folder-controls"],
  },
};

// Picks that use resources outside the picked folders: those come as the
// package's dependencies, some of them through other dependencies, and a
// resource nothing picked uses stays out.
const DEPENDENCIES_CASE = {
  name: "dependencies",
  files: [
    file("file-font-one", "font/ttf", createFontBytes("Font One")),
    file("file-font-two", "font/ttf", createFontBytes("Font Two")),
    file("file-image-one", "image/png", PNG.red),
    file("file-image-unused", "image/png", PNG.white),
    file("file-spritesheet-one", "image/png", PNG.gold),
    file("file-sound-one", "audio/wav", createWavBytes([128, 96, 128, 160])),
    file("file-sound-one-waveform", "application/json", WAVEFORM_JSON),
    file("file-character-one", "image/png", PNG.purple),
    file("file-sprite-one", "image/png", PNG.teal),
    file("file-sprite-two", "image/png", PNG.brown),
  ],
  scenes: [],
  resources: {
    images: [
      folder("folder-image-library", "Image Library", [
        item("image-one", {
          type: "image",
          name: "Image One",
          fileId: "file-image-one",
          width: 1,
          height: 1,
        }),
        item("image-unused", {
          type: "image",
          name: "Image Unused",
          fileId: "file-image-unused",
          width: 1,
          height: 1,
        }),
      ]),
    ],
    sounds: [
      folder("folder-sound-library", "Sound Library", [
        item("sound-one", {
          type: "sound",
          name: "Sound One",
          fileId: "file-sound-one",
          waveformDataFileId: "file-sound-one-waveform",
          duration: 0.5,
        }),
      ]),
    ],
    spritesheets: [
      folder("folder-spritesheet-library", "Spritesheet Library", [
        item("spritesheet-one", {
          type: "spritesheet",
          name: "Spritesheet One",
          fileId: "file-spritesheet-one",
          ...structuredClone(SPRITESHEET_ATLAS),
        }),
      ]),
    ],
    colors: [
      folder("folder-color-library", "Color Library", [
        item("color-one", { type: "color", name: "Color One", hex: "#CC3333" }),
        item("color-two", { type: "color", name: "Color Two", hex: "#3355CC" }),
      ]),
    ],
    fonts: [
      folder("folder-font-library", "Font Library", [
        item("font-one", {
          type: "font",
          name: "Font One",
          fileId: "file-font-one",
          fontFamily: "Font One",
        }),
        item("font-two", {
          type: "font",
          name: "Font Two",
          fileId: "file-font-two",
          fontFamily: "Font Two",
        }),
      ]),
    ],
    variables: [
      folder("folder-variable-library", "Variable Library", [
        item("variable-name", {
          type: "variable",
          variableType: "string",
          name: "Player Name",
          scope: "context",
          default: "",
          value: "",
        }),
        item("variableScore", {
          type: "variable",
          variableType: "number",
          name: "Score",
          scope: "context",
          default: 0,
          value: 0,
        }),
        item("variable-base", {
          type: "variable",
          variableType: "number",
          name: "Base",
          scope: "context",
          default: 1,
          value: 1,
        }),
        // Ids may start with a digit; a path names one with a dot as well.
        item("9bonus", {
          type: "variable",
          variableType: "number",
          name: "Bonus",
          scope: "context",
          default: 0,
          value: 0,
        }),
        item("variable-start", {
          type: "variable",
          variableType: "number",
          name: "Start",
          scope: "context",
          default: 0,
          value: 0,
        }),
        item("variableFlag", {
          type: "variable",
          variableType: "boolean",
          name: "Flag",
          scope: "context",
          default: false,
          value: false,
        }),
      ]),
      folder("folder-variables", "Variables", [
        // An example's input names a variable the expression does not use,
        // which goes with the package too.
        item("variable-total", {
          type: "variable",
          variableType: "number",
          name: "Total",
          computed: {
            expr: {
              add: [
                { var: 'variables["variable-base"]' },
                { var: "variables.9bonus" },
              ],
            },
            examples: [
              {
                id: "example-one",
                name: "One",
                input: {
                  variables: { "variable-base": 1, "variable-start": 2 },
                },
              },
            ],
          },
        }),
      ]),
    ],
    textStyles: [
      folder("folder-text-style-library", "Text Style Library", [
        item("text-style-two", {
          type: "textStyle",
          name: "Text Style Two",
          fontId: ["font-two"],
          colorId: "color-one",
          fontSize: 18,
          lineHeight: 1.2,
          fontWeight: "400",
        }),
      ]),
      folder("folder-text-styles", "Text Styles", [
        item("text-style-one", {
          type: "textStyle",
          name: "Text Style One",
          description: "Uses two colors and a font it does not pick",
          fontId: ["font-one"],
          colorId: "color-one",
          fontSize: 24,
          lineHeight: 1.5,
          fontWeight: "700",
          shadow: {
            colorId: "color-two",
            alpha: 0.5,
            blur: 2,
            offsetX: 1,
            offsetY: 1,
          },
        }),
      ]),
    ],
    characters: [
      folder("folder-characters", "Characters", [
        item("character-one", {
          type: "character",
          name: "Character One",
          fileId: "file-character-one",
          nameVariableId: "variable-name",
          sprites: {
            items: {
              "sprite-one": {
                id: "sprite-one",
                type: "image",
                name: "Sprite One",
                fileId: "file-sprite-one",
                width: 1,
                height: 1,
              },
            },
            tree: [{ id: "sprite-one", children: [] }],
          },
        }),
      ]),
      folder("folder-character-library", "Character Library", [
        item("character-two", {
          type: "character",
          name: "Character Two",
          sprites: {
            items: {
              "sprite-two": {
                id: "sprite-two",
                type: "image",
                name: "Sprite Two",
                fileId: "file-sprite-two",
                width: 1,
                height: 1,
              },
            },
            tree: [{ id: "sprite-two", children: [] }],
          },
        }),
        item("character-three", { type: "character", name: "Character Three" }),
      ]),
    ],
    transforms: [
      folder("folder-transforms", "Transforms", [
        item("transform-one", {
          type: "transform",
          name: "Transform One",
          x: 640,
          y: 720,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0.5,
          anchorY: 1,
          rotation: 0,
          preview: {
            target: {
              characterId: "character-two",
              sprites: [{ id: "sprite-group-body", resourceId: "sprite-two" }],
            },
          },
        }),
      ]),
    ],
    layouts: [
      folder("folder-layout-library", "Layout Library", [
        item("layout-fragment", {
          type: "layout",
          name: "Layout Fragment",
          layoutType: "general",
          isFragment: true,
          elements: elements(
            element("element-frame", {
              type: "sprite",
              name: "Frame",
              imageId: "image-one",
            }),
          ),
        }),
      ]),
      folder("folder-layouts", "Layouts", [
        // The preview's avatar is a sprite of its speaker, which goes with
        // the package.
        item("layout-one", {
          type: "layout",
          name: "Layout One",
          layoutType: "general",
          preview: {
            variables: { variableScore: 2 },
            dialogue: {
              characterId: "character-two",
              character: {
                name: "Character Two",
                sprite: { items: [{ id: "base", resourceId: "sprite-two" }] },
              },
              content: [{ text: "Hello" }],
            },
          },
          elements: elements(
            element("element-title", {
              type: "text",
              name: "Title",
              text: "Title",
              textStyleId: "text-style-two",
              conditionalOverrides: [
                {
                  when: {
                    target: "variables.variableScore",
                    op: "eq",
                    value: 3,
                  },
                  set: { textStyleId: "text-style-one" },
                },
                {
                  when: {
                    target: "dialogue.characterId",
                    op: "eq",
                    value: "character-three",
                  },
                  set: { opacity: 0.5 },
                },
              ],
            }),
            element("element-button", {
              type: "sprite",
              name: "Button",
              imageId: "image-one",
              clickSoundId: "sound-one",
              click: actions({
                conditional: {
                  branches: [
                    {
                      when: { gte: [{ var: "variables.variableScore" }, 1] },
                      actions: { nextLine: {} },
                    },
                  ],
                },
              }),
            }),
            element("element-name", {
              type: "text",
              name: "Name",
              textStyleId: "text-style-one",
              $when: "variables.variableFlag == true",
              content: [{ reference: { resourceId: "variable-name" } }],
            }),
            element("element-idle", {
              type: "spritesheet-animation",
              name: "Idle",
              resourceId: "spritesheet-one",
              animationName: "idle",
            }),
            element("element-fragment", {
              type: "fragment-ref",
              name: "Fragment",
              fragmentLayoutId: "layout-fragment",
            }),
            element("element-slider", {
              type: "slider",
              name: "Score",
              width: 200,
              height: 20,
              variableId: "variableScore",
              min: 0,
              max: 10,
              step: 1,
            }),
          ),
        }),
        // The preview's avatar is a sprite of a character it does not name
        // as the speaker, which the package leaves out.
        item("layout-two", {
          type: "layout",
          name: "Layout Two",
          layoutType: "general",
          preview: {
            dialogue: {
              characterId: "",
              character: {
                name: "Narrator",
                sprite: { items: [{ id: "base", resourceId: "sprite-one" }] },
              },
              content: [{ text: "Hello" }],
            },
          },
          elements: elements(
            element("element-box", {
              type: "rect",
              name: "Box",
              fill: "#202020",
            }),
          ),
        }),
      ]),
    ],
  },
  picks: {
    characters: ["folder-characters"],
    transforms: ["folder-transforms"],
    textStyles: ["folder-text-styles"],
    layouts: ["folder-layouts"],
    variables: ["folder-variables"],
  },
};

// Picks that jump into the story and open layouts the package does not
// carry: each becomes one of the package's links. A dependency jumps into
// the story too, and layouts the package carries are opened as themselves.
const LINKS_CASE = {
  name: "links",
  files: [
    file("file-image-one", "image/png", PNG.red),
    file("file-image-two", "image/png", PNG.green),
  ],
  scenes: [
    scene("scene-intro", "Scene One", [
      section("section-start", "Section One"),
      section("section-other", "Section Two"),
    ]),
    scene("scene-ending", "Scene Two", [
      section("section-end", "Section Three"),
    ]),
  ],
  resources: {
    images: [
      folder("folder-image-library", "Image Library", [
        item("image-one", {
          type: "image",
          name: "Image One",
          fileId: "file-image-one",
          width: 1,
          height: 1,
        }),
        item("image-two", {
          type: "image",
          name: "Image Two",
          fileId: "file-image-two",
          width: 1,
          height: 1,
        }),
      ]),
    ],
    layouts: [
      folder("folder-layout-library", "Layout Library", [
        // Only opened, so a link; what it uses stays out of the package.
        item("layout-options", {
          type: "layout",
          name: "Options Menu",
          layoutType: "general",
          elements: elements(
            element("element-background", {
              type: "sprite",
              name: "Background",
              imageId: "image-two",
            }),
          ),
        }),
        item("layout-confirm", {
          type: "layout",
          name: "Confirm Quit",
          layoutType: "confirmDialog",
          elements: elements(),
        }),
        // Drawn by a pick, so a dependency, which jumps into the story.
        item("layout-hud", {
          type: "layout",
          name: "Hud Fragment",
          layoutType: "general",
          isFragment: true,
          elements: elements(
            element("element-restart", {
              type: "sprite",
              name: "Restart",
              imageId: "image-one",
              click: actions({
                resetStoryAtSection: { sectionId: "section-other" },
              }),
            }),
          ),
        }),
      ]),
      folder("folder-menus", "Menus", [
        item("layout-title", {
          type: "layout",
          name: "Title Menu",
          layoutType: "general",
          elements: elements(
            element("element-start", {
              type: "rect",
              name: "Start",
              width: 100,
              height: 40,
              click: actions({
                sectionTransition: {
                  sceneId: "scene-intro",
                  sectionId: "section-start",
                },
              }),
            }),
            element("element-ending", {
              type: "rect",
              name: "Ending",
              width: 100,
              height: 40,
              click: actions({
                sectionTransition: { sceneId: "scene-ending" },
              }),
            }),
            element("element-options", {
              type: "rect",
              name: "Options",
              width: 100,
              height: 40,
              click: actions({
                pushOverlay: { resourceId: "layout-options" },
              }),
            }),
            element("element-quit", {
              type: "rect",
              name: "Quit",
              width: 100,
              height: 40,
              click: actions({
                showConfirmDialog: {
                  resourceId: "layout-confirm",
                  confirmActions: {
                    resetStoryAtSection: { sectionId: "section-end" },
                  },
                  cancelActions: {},
                },
              }),
            }),
            element("element-history", {
              type: "rect",
              name: "History",
              width: 100,
              height: 40,
              click: actions({
                pushOverlay: { resourceId: "layout-history" },
              }),
            }),
            element("element-hud", {
              type: "fragment-ref",
              name: "Hud",
              fragmentLayoutId: "layout-hud",
            }),
            element("element-hud-open", {
              type: "rect",
              name: "Hud Open",
              width: 100,
              height: 40,
              click: actions({ pushOverlay: { resourceId: "layout-hud" } }),
            }),
          ),
        }),
        item("layout-history", {
          type: "layout",
          name: "History Menu",
          layoutType: "general",
          elements: elements(
            element("element-back", {
              type: "rect",
              name: "Back",
              width: 100,
              height: 40,
              click: actions({
                popOverlay: {},
                resetStoryAtSection: { sectionId: "section-start" },
              }),
            }),
          ),
        }),
      ]),
    ],
    controls: [
      folder("folder-controls", "Controls", [
        item("control-one", {
          type: "control",
          name: "Control One",
          keyboard: {
            esc: actions({ pushOverlay: { resourceId: "layout-options" } }),
          },
          elements: elements(),
        }),
      ]),
    ],
  },
  picks: {
    layouts: ["folder-menus"],
    controls: ["folder-controls"],
  },
};

export const ASSET_PACKAGE_FIXTURE_CASES = [
  ALL_TYPES_CASE,
  DEPENDENCIES_CASE,
  LINKS_CASE,
];

// The order the source projects create their types in, so each resource
// exists before another uses it.
const CREATE_ORDER = [
  "images",
  "sounds",
  "videos",
  "spritesheets",
  "colors",
  "fonts",
  "variables",
  "textStyles",
  "characters",
  "transforms",
  "animations",
  "audioEffects",
  "particles",
  "layouts",
  "controls",
];

/**
 * A project in a real repository with the real model, changed only through
 * commands. `submit` applies commands and fails on the first invalid one.
 */
export const createTestProject = async ({ projectId, idPrefix }) => {
  const repository = await createProjectRepository({
    projectId,
    store: {
      appendEvents: async () => {},
      loadMaterializedViewCheckpoint: async () => undefined,
      saveMaterializedViewCheckpoint: async () => {},
      deleteMaterializedViewCheckpoint: async () => {},
    },
    events: [],
    historyLoaded: true,
  });
  const actor = { userId: "user-one", clientId: "client-one" };
  const session = {
    getActor: () => actor,
    submitCommands: async (commands) => commands.map((command) => command.id),
  };
  let commandCount = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `${idPrefix}-command-${++commandCount}`,
    now: () => 1,
    getCurrentProjectId: () => projectId,
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => actor,
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "m",
    resourceTypePartitionFor: () => "m",
  });
  const submit = async (commands) => {
    const result = await shared.submitCommandsWithContext({
      context: await shared.ensureCommandContext(),
      commands,
    });
    if (result.valid === false) {
      throw new Error(
        `Project '${projectId}' rejected ${commands.map((command) => command.type).join(", ")}: ${result.error?.message}`,
      );
    }
  };
  return { projectId, repository, shared, submit };
};

const createResourceCommands = (resourceType, nodes, parentId) =>
  nodes.flatMap((node) => {
    const { commandType, idField } =
      ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[resourceType];
    const command = {
      type: commandType,
      payload: {
        [idField]: node.id,
        data: structuredClone(node.data),
        parentId: parentId ?? null,
        position: "last",
      },
    };
    return [
      command,
      ...createResourceCommands(resourceType, node.children ?? [], node.id),
    ];
  });

const createSourceCommands = (fixtureCase) => [
  ...fixtureCase.files.map(({ id, mimeType, bytes }) => ({
    type: "file.create",
    payload: {
      fileId: id,
      data: { mimeType, size: bytes.byteLength, sha256: sha256(bytes) },
    },
  })),
  ...fixtureCase.scenes.flatMap(({ id, name, sections }) => [
    {
      type: "scene.create",
      payload: { sceneId: id, data: { type: "scene", name } },
    },
    ...sections.map((entry) => ({
      type: "section.create",
      payload: { sceneId: id, sectionId: entry.id, data: { name: entry.name } },
    })),
  ]),
  ...CREATE_ORDER.flatMap((resourceType) =>
    createResourceCommands(
      resourceType,
      fixtureCase.resources[resourceType] ?? [],
    ),
  ),
];

/** The case's source project, built with commands. */
export const createSourceProject = async (fixtureCase) => {
  const project = await createTestProject({
    projectId: `project-${fixtureCase.name}`,
    idPrefix: fixtureCase.name,
  });
  for (const command of createSourceCommands(fixtureCase)) {
    await project.submit([command]);
  }
  assertSupportedProjectState(project.repository.getState());
  return project;
};

// The generated previews: a PNG for an image, the start of an MP4 for a
// video. Their bytes do not matter, only that the package carries them.
const PREVIEW_PNG = PNG.pink;
const imagePreviews = () => ({
  previewBlob: new Blob([PREVIEW_PNG], { type: "image/png" }),
  thumbnailBlob: new Blob([PREVIEW_PNG], { type: "image/png" }),
});
const videoPreviews = () => ({
  previewBlob: new Blob([MP4], { type: "video/mp4" }),
  thumbnailBlob: new Blob([PREVIEW_PNG], { type: "image/png" }),
});

/**
 * Exports `selectedFolderIdsByType` of `repositoryState` as the asset package
 * page does, and returns the files of the ZIP it saves by path.
 */
export const exportAssetPackageFiles = async ({
  repositoryState,
  fileBytesById,
  selectedFolderIdsByType,
}) => {
  const state = createInitialState();
  setFilesData({ state }, { filesData: repositoryState.files });
  setScenesData({ state }, { scenesData: repositoryState.scenes });
  setResourceData(
    { state },
    {
      resourceDataByType: Object.fromEntries(
        ASSET_PACKAGE_RESOURCE_TYPES.map((resourceType) => [
          resourceType,
          repositoryState[resourceType],
        ]),
      ),
    },
  );
  setAssetPackage(
    { state },
    {
      assetPackage: {
        schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
        resources: Object.entries(selectedFolderIdsByType).map(
          ([resourceType, folderIds]) => ({ resourceType, folderIds }),
        ),
      },
    },
  );
  const manifest = createAssetPackageManifest(
    selectAssetPackageData({ state }),
  );

  const exportService = createAssetPackageExportService({
    getFileContent: async (fileId) => ({ url: `project-file:${fileId}` }),
    getRepositoryState: () => repositoryState,
    fetchImpl: async (url) => {
      const bytes = fileBytesById.get(url.replace(/^project-file:/, ""));
      return { ok: Boolean(bytes), arrayBuffer: async () => bytes.slice() };
    },
    renderWaveformThumbnail: async () =>
      new Blob([PREVIEW_PNG], { type: "image/png" }),
    renderSpritesheetPreview: async () => videoPreviews(),
    renderFontPreview: async () => imagePreviews(),
    renderTextStylePreview: async () => imagePreviews(),
    renderAnimationPreviews: async ({ animations }) =>
      animations.map(({ animationId }) => ({
        animationId,
        ...videoPreviews(),
      })),
    renderParticlePreview: async () => videoPreviews(),
  });
  const bundle = await exportService.createAssetPackageBundle({ manifest });
  const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
  const files = new Map();
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir) {
      files.set(entry.name, await entry.async("uint8array"));
    }
  }
  return files;
};

/**
 * Every case's package files by path, and the version folder they belong
 * in, without writing anything.
 */
export const generateAssetPackageFixtures = async () => {
  const cases = new Map();
  let version;
  for (const fixtureCase of ASSET_PACKAGE_FIXTURE_CASES) {
    const { repository } = await createSourceProject(fixtureCase);
    const files = await exportAssetPackageFiles({
      repositoryState: repository.getState(),
      fileBytesById: new Map(
        fixtureCase.files.map(({ id, bytes }) => [id, bytes]),
      ),
      selectedFolderIdsByType: fixtureCase.picks,
    });
    const { schema } = JSON.parse(
      new TextDecoder().decode(files.get(ASSET_PACKAGE_MANIFEST_PATH)),
    );
    version = getAssetPackageFixtureVersion(schema);
    cases.set(fixtureCase.name, files);
  }
  return { version, cases };
};

const writeAssetPackageFixtures = async () => {
  const { version, cases } = await generateAssetPackageFixtures();
  for (const [name, files] of cases) {
    const caseDir = join(ASSET_PACKAGE_FIXTURES_DIR, version, name);
    await rm(caseDir, { recursive: true, force: true });
    for (const [path, bytes] of files) {
      await mkdir(dirname(join(caseDir, path)), { recursive: true });
      await writeFile(join(caseDir, path), bytes);
    }
    console.log(`Wrote ${files.size} files to ${caseDir}`);
  }
};

const isCli = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isCli) {
  await writeAssetPackageFixtures();
}
