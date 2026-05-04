import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setBranches,
  setTempBranch,
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
              type: "variable",
              variableType: "number",
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
              eq: [{ var: "variables.trust" }, 70],
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
        summary: "Trust Equals 70",
        actionsSummary: "1 action",
      },
    ]);
    expect(viewData.defaultBranch).toMatchObject({
      id: "branch-2",
      summary: "Default",
      actionsSummary: "1 action",
    });
    expect(viewData.operatorOptions.map((option) => option.value)).toEqual([
      "eq",
      "neq",
    ]);
    expect(viewData.variableOptions).toEqual([
      {
        value: "trust",
        label: "Trust",
        suffixText: "number",
      },
    ]);
  });

  it("exposes inherited hidden modes for nested branch action editors", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        hiddenModes: ["showConfirmDialog", "", 42, "hideConfirmDialog"],
      },
    });

    expect(viewData.hiddenModes).toEqual([
      "showConfirmDialog",
      "hideConfirmDialog",
    ]);
    expect(viewData.branchActionAllowedModes).toEqual([
      "sectionTransition",
      "resetStoryAtSection",
      "updateVariable",
    ]);
  });

  it("exposes enum values as conditional value options", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              name: "Mood",
              type: "variable",
              variableType: "string",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [{ id: "mood" }],
        },
      },
    );
    setTempBranch(
      { state },
      {
        variableId: "mood",
        value: "happy",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.showEnumValueSelect).toBe(true);
    expect(viewData.enumValueOptions).toEqual([
      { value: "happy", label: "happy" },
      { value: "sad", label: "sad" },
    ]);
    expect(viewData.canSaveBranch).toBe(true);
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
          when: {
            eq: [{ var: "variables.trust" }, 70],
          },
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
            when: {
              eq: [{ var: "variables.trust" }, 70],
            },
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
        when: {
          eq: [{ var: "variables.trust" }, 70],
        },
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
