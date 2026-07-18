import { describe, expect, it } from "vitest";
import {
  createInitialState,
  moveBranch,
  selectViewData,
  setBranches,
  setTempBranch,
  setVariablesData,
  showDropdownMenu,
  updateBranch,
} from "../../src/components/commandLineConditional/commandLineConditional.store.js";
import { EN_I18N } from "../support/i18n.js";

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
    setTempBranch({ state }, { variableId: "trust", value: 70 });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.branches).toMatchObject([
      {
        id: "branch-1",
        summary: "Trust Greater Than or Equal 70",
        actionsSummary: "1 action",
      },
    ]);
    expect(viewData.defaultBranch).toMatchObject({
      id: "branch-2",
      summary: "Default branch",
      actionsSummary: "1 action",
    });
    expect(viewData.operatorOptions.map((option) => option.value)).toEqual([
      "eq",
      "neq",
      "in",
      "gt",
      "gte",
      "lt",
      "lte",
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
      i18n: EN_I18N,
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

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.showEnumValueSelect).toBe(true);
    expect(viewData.enumValueOptions).toEqual([
      { value: "happy", label: "happy" },
      { value: "sad", label: "sad" },
    ]);
    expect(viewData.operatorOptions.map((option) => option.value)).toEqual([
      "eq",
      "neq",
      "in",
    ]);
    expect(viewData.canSaveBranch).toBe(true);

    setTempBranch({ state }, { op: "gt" });

    expect(selectViewData({ state, i18n: EN_I18N }).canSaveBranch).toBe(false);
  });

  it("edits and summarizes one-of conditions with type-valid values", () => {
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
              enumValues: ["happy", "neutral", "sad"],
            },
          },
          tree: [{ id: "mood" }],
        },
      },
    );
    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-mood",
            when: {
              in: [
                { var: "variables.mood" },
                { literal: ["happy", "neutral"] },
              ],
            },
            actions: {},
          },
        ],
      },
    );
    setTempBranch(
      { state },
      {
        variableId: "mood",
        op: "in",
        value: ["happy", "neutral"],
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.branches[0].summary).toBe("Mood One Of happy, neutral");
    expect(viewData.showValueField).toBe(false);
    expect(viewData.showOneOfValueFields).toBe(true);
    expect(viewData.oneOfValues).toEqual(["happy", "neutral"]);
    expect(viewData.oneOfRemoveButtonStyle).toBe("");
    expect(viewData.addValueButton).toBe("Add Value");
    expect(viewData.canSaveBranch).toBe(true);

    setTempBranch({ state }, { value: ["happy"] });
    expect(
      selectViewData({ state, i18n: EN_I18N }).oneOfRemoveButtonStyle,
    ).toBe("visibility: hidden;");

    setTempBranch({ state }, { value: ["happy", "happy"] });
    expect(selectViewData({ state, i18n: EN_I18N }).canSaveBranch).toBe(false);

    setTempBranch({ state }, { value: ["happy", "unknown"] });
    expect(selectViewData({ state, i18n: EN_I18N }).canSaveBranch).toBe(false);
  });

  it("allows unsupported condition drafts to save without variable controls", () => {
    const state = createInitialState();

    setTempBranch(
      { state },
      {
        conditionKind: "unsupported",
        when: {
          all: [
            {
              eq: [{ var: "variables.route" }, "north"],
            },
          ],
        },
        actions: {
          nextLine: {},
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.isEditingUnsupportedCondition).toBe(true);
    expect(viewData.showValueField).toBe(false);
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

  it("moves conditional branches and exposes only available move actions", () => {
    const state = createInitialState();
    const createConditionBranch = (id) => ({
      id,
      when: {
        eq: [{ var: "variables.trust" }, id],
      },
      actions: {},
    });

    setBranches(
      { state },
      {
        branches: [
          createConditionBranch("branch-1"),
          createConditionBranch("branch-2"),
          createConditionBranch("branch-3"),
          { id: "branch-default", actions: {} },
        ],
      },
    );

    showDropdownMenu(
      { state },
      { branchId: "branch-1", position: { x: 10, y: 20 } },
    );
    expect(state.dropdownMenu.items.map((item) => item.value)).toEqual([
      "move-down",
      "delete",
    ]);

    showDropdownMenu(
      { state },
      { branchId: "branch-2", position: { x: 10, y: 20 } },
    );
    expect(state.dropdownMenu.items.map((item) => item.value)).toEqual([
      "move-up",
      "move-down",
      "delete",
    ]);

    moveBranch({ state }, { branchId: "branch-2", direction: "up" });
    expect(state.branches.map((branch) => branch.id)).toEqual([
      "branch-2",
      "branch-1",
      "branch-3",
      "branch-default",
    ]);

    showDropdownMenu(
      { state },
      { branchId: "branch-default", position: { x: 10, y: 20 } },
    );
    expect(state.dropdownMenu.items.map((item) => item.value)).toEqual([
      "delete",
    ]);

    moveBranch({ state }, { branchId: "branch-default", direction: "up" });
    expect(state.branches.map((branch) => branch.id)).toEqual([
      "branch-2",
      "branch-1",
      "branch-3",
      "branch-default",
    ]);
  });
});
