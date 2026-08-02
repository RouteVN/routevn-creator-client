import { describe, expect, it } from "vitest";
import { toCreatorModelState } from "../../src/internal/creatorModelAdapter.js";

describe("creatorModelAdapter", () => {
  it("normalizes legacy stored number variables without defaults to zero", () => {
    const state = {
      variables: {
        items: {
          score: {
            id: "score",
            type: "variable",
            name: "Score",
            variableType: "number",
            scope: "context",
          },
          level: {
            id: "level",
            type: "variable",
            name: "Level",
            variableType: "number",
            scope: "context",
            default: "",
            value: "",
          },
          total: {
            id: "total",
            type: "variable",
            name: "Total",
            variableType: "number",
            computed: {
              expr: {
                add: [1, 2],
              },
            },
          },
        },
        tree: [{ id: "score" }, { id: "level" }, { id: "total" }],
      },
    };

    const normalizedState = toCreatorModelState(state);

    expect(normalizedState.variables.items.score).toMatchObject({
      default: 0,
      value: 0,
    });
    expect(normalizedState.variables.items.level).toMatchObject({
      default: 0,
      value: 0,
    });
    expect(normalizedState.variables.items.total).not.toHaveProperty("default");
    expect(normalizedState.variables.items.total).not.toHaveProperty("value");
    expect(state.variables.items.score).not.toHaveProperty("default");
    expect(state.variables.items.level.default).toBe("");
  });

  it("preserves a legacy number variable's current value", () => {
    const normalizedState = toCreatorModelState({
      variables: {
        items: {
          score: {
            id: "score",
            type: "variable",
            name: "Score",
            variableType: "number",
            scope: "context",
            value: 12,
          },
        },
        tree: [{ id: "score" }],
      },
    });

    expect(normalizedState.variables.items.score).toMatchObject({
      default: 0,
      value: 12,
    });
  });
});
