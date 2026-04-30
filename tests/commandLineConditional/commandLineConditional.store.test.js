import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setBranches,
  setVariablesData,
  updateBranch,
} from "../../src/components/commandLineConditional/commandLineConditional.store.js";

describe("commandLineConditional.store", () => {
  it("summarizes conditional branches and the default branch separately", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            trust: {
              id: "trust",
              name: "Trust",
              type: "number",
            },
          },
          tree: [{ id: "trust" }],
        },
      },
    );
    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-1",
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: {
              nextLine: {},
            },
          },
          {
            id: "branch-2",
            actions: {
              sectionTransition: {
                sceneId: "scene-2",
                sectionId: "section-2",
              },
            },
          },
        ],
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.branches).toMatchObject([
      {
        id: "branch-1",
        summary: "Trust Greater Or Equal 70",
        actionsSummary: "1 action",
      },
    ]);
    expect(viewData.defaultBranch).toMatchObject({
      id: "branch-2",
      summary: "Default",
      actionsSummary: "1 action",
    });
    expect(viewData.conditionKindOptions.map((option) => option.value)).toEqual(
      ["variable", "expression", "json"],
    );
  });

  it("inserts new conditional branches before an existing default branch", () => {
    const state = createInitialState();

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-default",
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    );

    updateBranch(
      { state },
      {
        branch: {
          id: "branch-condition",
          when: "variables.trust >= 70",
          actions: {
            sectionTransition: {
              sceneId: "scene-2",
              sectionId: "section-2",
            },
          },
        },
      },
    );

    expect(state.branches.map((branch) => branch.id)).toEqual([
      "branch-condition",
      "branch-default",
    ]);
  });

  it("replaces the existing default branch", () => {
    const state = createInitialState();

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-condition",
            when: "variables.trust >= 70",
            actions: {
              nextLine: {},
            },
          },
          {
            id: "branch-default",
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    );

    updateBranch(
      { state },
      {
        branch: {
          id: "branch-default-2",
          actions: {
            sectionTransition: {
              sceneId: "scene-2",
              sectionId: "section-2",
            },
          },
        },
      },
    );

    expect(state.branches).toEqual([
      {
        id: "branch-condition",
        when: "variables.trust >= 70",
        actions: {
          nextLine: {},
        },
      },
      {
        id: "branch-default-2",
        actions: {
          sectionTransition: {
            sceneId: "scene-2",
            sectionId: "section-2",
          },
        },
      },
    ]);
  });
});
