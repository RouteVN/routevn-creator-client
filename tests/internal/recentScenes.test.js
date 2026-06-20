import { describe, expect, it, vi } from "vitest";
import {
  getRecentSceneIds,
  recordRecentSceneVisit,
} from "../../src/internal/ui/recentScenes.js";

const createAppService = () => {
  let config = {};
  return {
    getUserConfig: vi.fn((key) => config[key]),
    setUserConfig: vi.fn((key, value) => {
      config = {
        ...config,
        [key]: structuredClone(value),
      };
    }),
  };
};

describe("recent scenes", () => {
  it("stores recently visited scenes newest first per project", () => {
    const appService = createAppService();

    expect(
      recordRecentSceneVisit({
        appService,
        projectId: "project-1",
        sceneId: "scene-1",
      }),
    ).toEqual(["scene-1"]);
    expect(
      recordRecentSceneVisit({
        appService,
        projectId: "project-1",
        sceneId: "scene-2",
      }),
    ).toEqual(["scene-2", "scene-1"]);
    expect(
      recordRecentSceneVisit({
        appService,
        projectId: "project-1",
        sceneId: "scene-1",
      }),
    ).toEqual(["scene-1", "scene-2"]);

    recordRecentSceneVisit({
      appService,
      projectId: "project-2",
      sceneId: "other-scene",
    });

    expect(
      getRecentSceneIds({
        appService,
        projectId: "project-1",
      }),
    ).toEqual(["scene-1", "scene-2"]);
    expect(
      getRecentSceneIds({
        appService,
        projectId: "project-2",
      }),
    ).toEqual(["other-scene"]);
    expect(appService.setUserConfig).toHaveBeenCalledWith(
      "sceneEditor.recentSceneIdsByProject",
      expect.objectContaining({
        "project-1": ["scene-1", "scene-2"],
        "project-2": ["other-scene"],
      }),
    );
  });
});
