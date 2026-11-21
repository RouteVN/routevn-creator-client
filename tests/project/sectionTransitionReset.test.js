import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  constructProjectData,
  findSceneIdBySectionId,
  getSectionPresentation,
} from "../../src/internal/project/projection.js";
import { buildSceneOverview } from "../../src/internal/project/sceneOverview.js";

const templateText = readFileSync(
  new URL("../../static/templates/default/repository.json", import.meta.url),
  "utf8",
);
const template = JSON.parse(templateText);
const visit = (value, callback) => {
  if (!value || typeof value !== "object") return;
  callback(value);
  Object.values(value).forEach((entry) => visit(entry, callback));
};

describe("resetting section transitions", () => {
  it("authors the template's two resets with their target scene ids", () => {
    expect(templateText).not.toContain("resetStoryAtSection");
    const transitions = [];
    visit(template, (value) => {
      if (value.sectionTransition?.resetStory) {
        transitions.push(value.sectionTransition);
      }
    });
    expect(transitions).toHaveLength(2);
    for (const action of transitions) {
      expect(action).toEqual({
        sceneId: findSceneIdBySectionId(template.scenes, action.sectionId),
        sectionId: action.sectionId,
        resetStory: true,
      });
    }
  });

  it("preserves resetStory, sceneId, screen and legacy actions in engine projection", () => {
    const repository = structuredClone(template);
    repository.project.resolution = { width: 1280, height: 720 };
    const [sceneId, scene] = Object.entries(repository.scenes.items).find(
      ([, item]) => item.type === "scene",
    );
    const [sectionId, section] = Object.entries(scene.sections.items)[0];
    const lineId = section.lines.tree[0].id;
    const reset = {
      sceneId,
      sectionId,
      resetStory: true,
      screen: { animations: { resourceId: "animation-1" } },
    };
    const actions = {
      conditional: {
        branches: [
          { when: { eq: [1, 1] }, actions: { sectionTransition: reset } },
          { actions: { resetStoryAtSection: { sectionId } } },
        ],
      },
    };
    section.lines.items[lineId].actions = actions;
    repository.controls.items["control-one"] = {
      type: "control",
      name: "Control One",
      keyboard: {
        enter: { payload: { actions: { sectionTransition: reset } } },
      },
    };
    repository.controls.tree.push({ id: "control-one" });
    const projectData = constructProjectData(repository);
    const projected =
      projectData.story.scenes[sceneId].sections[sectionId].lines[0];
    expect(projected.actions).toEqual(actions);
    expect(
      projectData.resources.controls["control-one"].keyboard.enter.actions
        .sectionTransition,
    ).toEqual(reset);
    const projectedResets = [];
    visit(projectData.resources, (value) => {
      if (value.sectionTransition?.resetStory)
        projectedResets.push(value.sectionTransition);
    });
    expect(projectedResets.length).toBeGreaterThanOrEqual(2);
    for (const action of projectedResets) {
      expect(action.sceneId).toBe(
        findSceneIdBySectionId(repository.scenes, action.sectionId),
      );
      expect(action.resetStory).toBe(true);
    }
  });

  it.each([
    { resetStoryAtSection: { sectionId: "section-menu" } },
    { sectionTransition: { sectionId: "section-menu", resetStory: true } },
    {
      sectionTransition: {
        sceneId: "scene-menu",
        sectionId: "section-menu",
        resetStory: true,
      },
    },
  ])(
    "recognizes menu returns in lines and nested layout actions (%j)",
    (actions) => {
      const scenes = {
        items: {
          "scene-menu": {
            type: "scene",
            sections: { items: { "section-menu": {} } },
          },
          "scene-1": {
            type: "scene",
            sections: {
              items: {
                "section-1": {
                  id: "section-1",
                  lines: [
                    { id: "line-1", actions },
                    {
                      id: "line-2",
                      actions: {
                        background: {
                          resourceType: "layout",
                          resourceId: "layout-1",
                        },
                      },
                    },
                  ],
                },
              },
              tree: [{ id: "section-1" }],
            },
          },
        },
      };
      const layouts = {
        items: {
          "layout-1": {
            elements: {
              items: {
                "element-1": {
                  scrollDown: {
                    payload: {
                      actions: { conditional: { branches: [{ actions }] } },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const presentation = getSectionPresentation({
        section: scenes.items["scene-1"].sections.items["section-1"],
        scenes,
        layouts,
        menuSceneId: "scene-menu",
      });
      expect(presentation).toMatchObject({
        outgoingCount: 1,
        isMenuReturn: true,
        isDeadEnd: false,
      });
      const overview = buildSceneOverview({
        repositoryState: {
          scenes,
          layouts,
          story: { initialSceneId: "scene-menu" },
        },
        sceneId: "scene-1",
      });
      expect(overview.outgoingSceneIds).toEqual(["scene-menu"]);
      expect(overview.sections[0].isDeadEnd).toBe(false);
      // A layout-only legacy reset must also count as a transition.
      expect(
        getSectionPresentation({
          section: {
            lines: [
              {
                actions: {
                  background: {
                    resourceType: "layout",
                    resourceId: "layout-1",
                  },
                },
              },
            ],
          },
          scenes,
          layouts,
          menuSceneId: "scene-menu",
        }),
      ).toMatchObject({ outgoingCount: 1, isMenuReturn: true });
    },
  );
});
