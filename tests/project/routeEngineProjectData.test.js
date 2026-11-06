import { describe, expect, it } from "vitest";
import { sanitizeProjectDataForRouteEngine } from "../../src/internal/project/routeEngineProjectData.js";

describe("sanitizeProjectDataForRouteEngine", () => {
  it("fixes the caller's copy in place instead of copying the story again", () => {
    const projectData = {
      story: {
        initialSceneId: "missing-scene",
        scenes: {
          "scene-1": {
            initialSectionId: "missing-section",
            sections: {
              "section-1": {
                initialLineId: "missing-line",
                lines: [{ id: "line-1" }, null],
              },
            },
          },
        },
      },
    };

    const result = sanitizeProjectDataForRouteEngine(projectData);

    expect(result.projectData).toBe(projectData);
    expect(result.didSanitize).toBe(true);
    expect(projectData.story.initialSceneId).toBe("scene-1");
    const scene = projectData.story.scenes["scene-1"];
    expect(scene.initialSectionId).toBe("section-1");
    expect(scene.sections["section-1"]).toEqual({
      initialLineId: "line-1",
      lines: [{ id: "line-1" }],
    });
  });
});
