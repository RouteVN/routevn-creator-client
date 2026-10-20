import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import { constructProjectData } from "../../src/internal/project/projection.js";

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const createRepositoryState = (lineActions) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
  variables: createTreeCollection({
    score: {
      id: "score",
      type: "variable",
      name: "Score",
      variableType: "number",
      scope: "context",
      default: 0,
      value: 0,
    },
  }),
  scenes: createTreeCollection({
    "scene-1": {
      id: "scene-1",
      type: "scene",
      name: "Scene 1",
      sections: createTreeCollection({
        "section-1": {
          id: "section-1",
          name: "Section 1",
          lines: createTreeCollection({
            "line-1": { id: "line-1", actions: lineActions },
          }),
        },
      }),
    },
  }),
});

// Runs the first line's actions the way the scene editor and the preview do
// when they start Route Engine on a line.
const startRouteEngine = (projectData) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      }
    },
  });
  engine.init({ initialState: { global: {}, projectData } });
  return engine;
};

const selectLineActions = (projectData) =>
  projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions;

describe("variable updates in Route Engine project data", () => {
  it("leaves out updates to a deleted variable and keeps the others", () => {
    const repositoryState = createRepositoryState({
      updateVariable: {
        id: "update1",
        operations: [
          { variableId: "deletedVariable", op: "set", value: 3 },
          { variableId: "score", op: "increment", value: 2 },
        ],
      },
    });
    const savedState = structuredClone(repositoryState);

    const projectData = constructProjectData(repositoryState);
    const engine = startRouteEngine(projectData);

    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(2);
    expect(selectLineActions(projectData).updateVariable).toEqual({
      id: "update1",
      operations: [{ variableId: "score", op: "increment", value: 2 }],
    });
    expect(repositoryState).toEqual(savedState);
  });

  it("leaves out an update whose only variable was deleted, also inside choices", () => {
    const projectData = constructProjectData(
      createRepositoryState({
        updateVariable: {
          id: "update1",
          operations: [{ variableId: "deletedVariable", op: "set", value: 3 }],
        },
        choice: {
          items: [
            {
              id: "choice-1",
              content: "Go",
              events: {
                click: {
                  actions: {
                    updateVariable: {
                      id: "update2",
                      operations: [
                        { variableId: "deletedVariable", op: "set", value: 1 },
                      ],
                    },
                    nextLine: {},
                  },
                },
              },
            },
          ],
        },
      }),
    );

    const lineActions = selectLineActions(projectData);
    expect(lineActions.updateVariable).toBeUndefined();
    expect(lineActions.choice.items[0].events.click.actions).toEqual({
      nextLine: {},
    });
    expect(() => startRouteEngine(projectData)).not.toThrow();
  });
});
