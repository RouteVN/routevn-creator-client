import { describe, expect, it } from "vitest";
import {
  extractTransitionTargetSceneIds,
  extractTransitionTargetSceneIdsFromActions,
} from "../../src/internal/project/layout.js";

const createProjectData = () => ({
  story: {
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
                  resetStoryAtSection: {
                    sectionId: "section-2",
                  },
                },
              },
              {
                id: "line-2",
                actions: {
                  sectionTransition: {
                    sectionId: "section-3",
                  },
                },
              },
            ],
          },
        },
      },
      "scene-2": {
        id: "scene-2",
        sections: {
          "section-2": {
            id: "section-2",
            lines: [],
          },
        },
      },
      "scene-3": {
        id: "scene-3",
        sections: {
          "section-3": {
            id: "section-3",
            lines: [],
          },
        },
      },
    },
  },
});

describe("transition target scene extraction", () => {
  it("resolves target scenes from scene actions that only reference section ids", () => {
    const projectData = createProjectData();

    expect(extractTransitionTargetSceneIds(projectData, "scene-1")).toEqual([
      "scene-2",
      "scene-3",
    ]);
  });

  it("resolves target scenes from standalone actions for resetStoryAtSection", () => {
    const projectData = createProjectData();

    expect(
      extractTransitionTargetSceneIdsFromActions(
        {
          resetStoryAtSection: {
            sectionId: "section-2",
          },
          sectionTransition: {
            sectionId: "section-3",
          },
        },
        projectData,
      ),
    ).toEqual(["scene-2", "scene-3"]);
  });
});
