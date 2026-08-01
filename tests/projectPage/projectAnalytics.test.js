import { describe, expect, it } from "vitest";
import {
  buildProjectAnalytics,
  selectProjectAnalyticsResourceRoute,
} from "../../src/pages/project/support/projectAnalytics.js";

describe("project analytics", () => {
  it.each([
    ["images", "/project/images"],
    ["sounds", "/project/sounds"],
    ["videos", "/project/videos"],
    ["characters", "/project/characters"],
    ["transforms", "/project/transforms"],
    ["animations", "/project/animations"],
    ["particles", "/project/particles"],
    ["spritesheets", "/project/spritesheets"],
    ["colors", "/project/colors"],
    ["fonts", "/project/fonts"],
    ["textStyles", "/project/text-styles"],
    ["layouts", "/project/layouts"],
    ["variables", "/project/variables"],
    ["controls", "/project/controls"],
    ["scenes", "/project/scenes"],
  ])("routes %s analytics to %s", (resourceKey, route) => {
    expect(selectProjectAnalyticsResourceRoute({ resourceKey })).toBe(route);
  });

  it("groups resources and counts nested character media", () => {
    const repositoryState = {
      scenes: {
        items: {
          "folder-1": { id: "folder-1", name: "Chapter", type: "folder" },
          "scene-1": { id: "scene-1", name: "Opening", type: "scene" },
          "scene-2": { id: "scene-2", name: "Ending", type: "scene" },
        },
        tree: [
          {
            id: "folder-1",
            children: [{ id: "scene-2" }, { id: "scene-1" }],
          },
        ],
      },
      images: {
        items: {
          "image-1": { id: "image-1", type: "image" },
          "image-2": { id: "image-2", type: "image" },
          "image-folder": { id: "image-folder", type: "folder" },
        },
      },
      characters: {
        items: {
          "character-1": {
            id: "character-1",
            name: "Hero",
            type: "character",
            sprites: {
              items: {
                "sprite-image-1": { id: "sprite-image-1", type: "image" },
                "sprite-image-2": { id: "sprite-image-2", type: "image" },
                "sprite-sheet-1": {
                  id: "sprite-sheet-1",
                  type: "spritesheet",
                },
                "sprite-folder": { id: "sprite-folder", type: "folder" },
              },
            },
          },
        },
        tree: [{ id: "character-1" }],
      },
      variables: {
        items: {
          "variable-1": { id: "variable-1", type: "variable" },
          "variable-folder": { id: "variable-folder", type: "folder" },
        },
      },
    };
    const sceneOverviewsById = {
      "scene-1": {
        textStats: { lineCount: 3, wordCount: 120, characterCount: 480 },
      },
      "scene-2": {
        textStats: { lineCount: 2, wordCount: 80, characterCount: 320 },
      },
    };

    const analytics = buildProjectAnalytics({
      repositoryState,
      sceneOverviewsById,
    });

    expect(analytics.resourceGroups).toEqual([
      {
        key: "assets",
        resources: [
          { key: "images", count: 2 },
          { key: "sounds", count: 0 },
          { key: "videos", count: 0 },
          { key: "characters", count: 1 },
          { key: "transforms", count: 0 },
        ],
      },
      {
        key: "animatedAssets",
        resources: [
          { key: "animations", count: 0 },
          { key: "particles", count: 0 },
          { key: "spritesheets", count: 0 },
        ],
      },
      {
        key: "userInterface",
        resources: [
          { key: "colors", count: 0 },
          { key: "fonts", count: 0 },
          { key: "textStyles", count: 0 },
          { key: "layouts", count: 0 },
        ],
      },
      {
        key: "systemConfig",
        resources: [
          { key: "variables", count: 1 },
          { key: "controls", count: 0 },
        ],
      },
    ]);
    expect(analytics.characterResources).toEqual([
      {
        id: "character-1",
        name: "Hero",
        spriteCount: 3,
      },
    ]);
    expect(analytics.scenes).toEqual([
      {
        id: "scene-2",
        name: "Ending",
        wordCount: 80,
        characterCount: 320,
      },
      {
        id: "scene-1",
        name: "Opening",
        wordCount: 120,
        characterCount: 480,
      },
    ]);
  });
});
