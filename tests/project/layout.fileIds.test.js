import { describe, expect, it } from "vitest";
import { extractFileIdsForValue } from "../../src/internal/project/layout.js";

const createProjectData = () => ({
  resources: {
    images: {},
    spritesheets: {},
    videos: {},
    sounds: {},
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
