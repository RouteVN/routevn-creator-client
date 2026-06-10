import { describe, expect, it } from "vitest";
import {
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
