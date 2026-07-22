import { describe, expect, it } from "vitest";
import {
  extractFileIdsForLayouts,
  extractFileIdsForScenes,
  extractFileIdsForValue,
} from "../../src/internal/project/layout.js";

const createProjectData = () => ({
  resources: {
    images: {},
    spritesheets: {},
    videos: {},
    sounds: {},
    voices: {},
    particles: {},
    fonts: {},
    colors: {},
    textStyles: {},
    layouts: {},
    transforms: {},
    animations: {},
    characters: {
      "character-hero": {
        id: "character-hero",
        type: "character",
        name: "Hero",
        sprites: {
          items: {
            "sprite-body": {
              id: "sprite-body",
              type: "image",
              name: "Body",
              fileId: "file-body",
              fileType: "image/webp",
            },
          },
          tree: [{ id: "sprite-body" }],
        },
      },
    },
  },
});

describe("layout file id extraction", () => {
  it("includes voice action resource files when extracting scene assets", () => {
    const projectData = createProjectData();
    projectData.story = {
      scenes: {
        "scene-1": {
          id: "scene-1",
          sections: {
            "section-1": {
              id: "section-1",
              lines: [
                {
                  id: "line-1",
                  actions: {
                    voice: {
                      resourceId: "voice-1",
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };
    projectData.resources.voices = {
      "scene-1": {
        "voice-1": {
          id: "voice-1",
          type: "voice",
          fileId: "file-voice",
          fileType: "audio/mpeg",
        },
      },
    };

    const fileReferences = extractFileIdsForScenes(projectData, ["scene-1"]);

    expect(fileReferences).toEqual([
      {
        url: "file-voice",
        type: "audio/mpeg",
      },
    ]);
  });

  it("includes text reveal sound files when extracting scene layout assets", () => {
    const projectData = createProjectData();
    projectData.resources.sounds = {
      "sound-reveal": {
        id: "sound-reveal",
        type: "sound",
        fileId: "file-reveal",
        fileType: "audio/ogg",
      },
    };
    projectData.resources.layouts = {
      "layout-main": {
        id: "layout-main",
        type: "layout",
        elements: {
          items: {
            "text-reveal": {
              id: "text-reveal",
              type: "text-revealing",
              revealSoundId: "sound-reveal",
            },
          },
          tree: [{ id: "text-reveal", children: [] }],
        },
      },
    };
    projectData.story = {
      scenes: {
        "scene-1": {
          id: "scene-1",
          sections: {
            "section-1": {
              id: "section-1",
              lines: [
                {
                  id: "line-1",
                  actions: {
                    dialogue: {
                      ui: {
                        resourceId: "layout-main",
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };

    const fileReferences = extractFileIdsForScenes(projectData, ["scene-1"]);

    expect(fileReferences).toEqual([
      {
        url: "file-reveal",
        type: "audio/ogg",
      },
    ]);
  });

  it("includes every font in an array-valued text style font stack", () => {
    const projectData = createProjectData();
    projectData.resources.fonts = {
      "font-primary": {
        id: "font-primary",
        type: "font",
        fileId: "file-primary",
        fileType: "font/ttf",
      },
      "font-fallback": {
        id: "font-fallback",
        type: "font",
        fileId: "file-fallback",
        fileType: "font/woff2",
      },
    };
    projectData.resources.textStyles = {
      "text-style-dialogue": {
        id: "text-style-dialogue",
        type: "textStyle",
        fontId: ["font-primary", "font-fallback"],
      },
    };
    projectData.resources.layouts = {
      "layout-main": {
        id: "layout-main",
        type: "layout",
        elements: {
          items: {
            dialogue: {
              id: "dialogue",
              type: "text",
              textStyleId: "text-style-dialogue",
            },
          },
          tree: [{ id: "dialogue", children: [] }],
        },
      },
    };

    expect(extractFileIdsForLayouts(projectData, ["layout-main"])).toEqual([
      {
        url: "file-primary",
        type: "font/ttf",
      },
      {
        url: "file-fallback",
        type: "font/woff2",
      },
    ]);
  });

  it("includes character action item ids when extracting temporary presentation assets", () => {
    const fileReferences = extractFileIdsForValue(createProjectData(), {
      character: {
        items: [
          {
            id: "character-hero",
            sprites: [
              {
                id: "body",
                resourceId: "sprite-body",
              },
            ],
          },
        ],
      },
    });

    expect(fileReferences).toEqual([
      {
        url: "file-body",
        type: "image/webp",
      },
    ]);
  });
});
