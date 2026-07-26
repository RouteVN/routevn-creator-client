import { describe, expect, it } from "vitest";
import {
  collectComputedVariableReferenceIds,
  constructProjectData,
  getComputedVariableDependents,
} from "../../src/internal/project/projection.js";

describe("computed variable projection helpers", () => {
  it("collects formula and conditional dependencies without reading literals", () => {
    expect(
      collectComputedVariableReferenceIds({
        branches: [
          {
            when: {
              eq: [{ var: 'variables["player.stats"]' }, 1],
            },
            expr: { var: "variables.score" },
          },
        ],
        default: {
          expr: {
            literal: { var: "variables.notADependency" },
          },
        },
      }),
    ).toEqual(["player.stats", "score"]);
  });

  it("finds reverse dependencies used to block deletion", () => {
    const variablesData = {
      items: {
        score: { id: "score", type: "variable", name: "Score" },
        label: {
          id: "label",
          type: "variable",
          name: "Score Label",
          computed: { expr: { var: "variables.score" } },
        },
      },
    };

    expect(
      getComputedVariableDependents(variablesData, {
        variableIds: ["score"],
      }).map((item) => item.id),
    ).toEqual(["label"]);
  });

  it("preserves computed definitions and maps the result type for the engine", () => {
    const computed = {
      expr: { round: [{ var: "variables.score" }] },
    };
    const projectData = constructProjectData({
      project: { resolution: { width: 1280, height: 720 } },
      story: {},
      scenes: { items: {}, tree: [] },
      variables: {
        items: {
          score: {
            id: "score",
            type: "variable",
            name: "Score",
            variableType: "number",
            scope: "context",
            default: 0,
            value: 0,
          },
          roundedScore: {
            id: "roundedScore",
            type: "variable",
            name: "Rounded score",
            variableType: "number",
            computed,
          },
        },
        tree: [],
      },
    });

    expect(projectData.resources.variables.roundedScore).toEqual(
      expect.objectContaining({
        type: "number",
        scope: "context",
        computed,
      }),
    );
    expect(projectData.resources.variables.roundedScore).not.toHaveProperty(
      "variableType",
    );
    expect(projectData.resources.variables.roundedScore).not.toHaveProperty(
      "default",
    );
  });
});
