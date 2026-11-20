import { describe, expect, it } from "vitest";
import {
  closeOutcomeDraft,
  createInitialState,
  deleteOutcome,
  moveOutcome,
  openOutcomeDraft,
  saveOutcomeDraft,
  selectViewData,
  setDistributionUnsupported,
  setOutcomes,
  setTempOutcomeActions,
  setTempOutcomeWeight,
  showDropdownMenu,
} from "../../src/components/commandLineRandom/commandLineRandom.store.js";
import { EN_I18N, FR_I18N, JA_I18N } from "../support/i18n.js";

const sectionTransition = {
  sceneId: "scene-1",
  sectionId: "section-2",
};

const updateVariable = {
  id: "update-1",
  operations: [{ variableId: "variable-1", op: "set", value: 1 }],
};

const createStateWithWeights = (...weights) => {
  const state = createInitialState();
  setOutcomes(
    { state },
    {
      outcomes: weights.map((weight, index) => ({
        id: `outcome-${index + 1}`,
        weight,
        actions: {},
      })),
    },
  );
  return state;
};

const viewDataOf = (state, { props = {}, i18n = EN_I18N } = {}) =>
  selectViewData({ state, props, i18n });

const outcomeIds = (state) => state.outcomes.map((outcome) => outcome.id);

describe("commandLineRandom.store", () => {
  it("summarizes each outcome's weight, chance and actions", () => {
    const state = createInitialState();
    setOutcomes(
      { state },
      {
        outcomes: [
          { id: "outcome-1", weight: 70, actions: { sectionTransition } },
          {
            id: "outcome-2",
            weight: 30,
            actions: { sectionTransition, updateVariable },
          },
          { id: "outcome-3", weight: 0, actions: {} },
        ],
      },
    );

    expect(viewDataOf(state).outcomes).toEqual([
      {
        id: "outcome-1",
        summary: "Weight 70 (70%)",
        actionsSummary: "1 action",
      },
      {
        id: "outcome-2",
        summary: "Weight 30 (30%)",
        actionsSummary: "2 actions",
      },
      {
        id: "outcome-3",
        summary: "Weight 0 (0%)",
        actionsSummary: "No actions (move to next line)",
      },
    ]);
  });

  it.each([
    [
      "one decimal",
      [1, 2, 3],
      ["Weight 1 (16.7%)", "Weight 2 (33.3%)", "Weight 3 (50%)"],
    ],
    [
      "a tiny chance that is not 0, beside one short of 100",
      [1, 99999],
      ["Weight 1 (0.001%)", "Weight 99999 (99.999%)"],
    ],
    [
      "chances just under 0.1% and just over 99.9%",
      [1, 3999],
      ["Weight 1 (0.025%)", "Weight 3999 (99.975%)"],
    ],
    [
      "a chance below what two decimals can show",
      [1, 1e7],
      ["Weight 1 (0.00001%)", "Weight 10000000 (99.99999%)"],
    ],
    ["a certain outcome", [0, 4], ["Weight 0 (0%)", "Weight 4 (100%)"]],
    ["every weight 0", [0, 0], ["Weight 0 (0%)", "Weight 0 (0%)"]],
    [
      "fractional weights",
      [0.5, 1.5],
      ["Weight 0.5 (25%)", "Weight 1.5 (75%)"],
    ],
  ])("rounds the chance with %s", (_label, weights, expected) => {
    const state = createStateWithWeights(...weights);

    expect(
      viewDataOf(state).outcomes.map((outcome) => outcome.summary),
    ).toEqual(expected);
  });

  it("formats weights and chances in the active language", () => {
    const state = createStateWithWeights(1.5, 1.5, 3);
    const [first] = viewDataOf(state, { i18n: FR_I18N }).outcomes;

    expect(first.summary).toContain("1,5");
    expect(first.summary).toContain("25 %");
    expect(first.summary).not.toContain("Weight");
  });

  it("writes every digit of a small chance in the active language", () => {
    const state = createStateWithWeights(1, 3999);
    const [small, large] = viewDataOf(state, { i18n: FR_I18N }).outcomes;

    expect(small.summary).toContain("(0,025\u00a0%)");
    expect(large.summary).toContain("(99,975\u00a0%)");
  });

  it.each([
    ["the first", "outcome-1", ["Move Down", "Delete"]],
    ["a middle", "outcome-2", ["Move Up", "Move Down", "Delete"]],
    ["the last", "outcome-3", ["Move Up", "Delete"]],
  ])("offers the moves %s outcome can make", (_label, outcomeId, labels) => {
    const state = createStateWithWeights(1, 2, 3);

    showDropdownMenu({ state }, { outcomeId, position: { x: 4, y: 8 } });

    const { dropdownMenu } = viewDataOf(state);
    expect(dropdownMenu.isOpen).toBe(true);
    expect(dropdownMenu.position).toEqual({ x: 4, y: 8 });
    expect(dropdownMenu.items.map((item) => item.label)).toEqual(labels);
  });

  it("offers only Delete for a single outcome", () => {
    const state = createStateWithWeights(1);

    showDropdownMenu(
      { state },
      { outcomeId: "outcome-1", position: { x: 0, y: 0 } },
    );

    expect(viewDataOf(state).dropdownMenu.items).toEqual([
      { label: "Delete", type: "item", value: "delete" },
    ]);
  });

  it("moves outcomes one place and stops at either end", () => {
    const state = createStateWithWeights(1, 2, 3);

    moveOutcome({ state }, { outcomeId: "outcome-1", direction: "up" });
    moveOutcome({ state }, { outcomeId: "outcome-3", direction: "down" });
    expect(outcomeIds(state)).toEqual(["outcome-1", "outcome-2", "outcome-3"]);

    moveOutcome({ state }, { outcomeId: "outcome-3", direction: "up" });
    expect(outcomeIds(state)).toEqual(["outcome-1", "outcome-3", "outcome-2"]);

    moveOutcome({ state }, { outcomeId: "outcome-1", direction: "down" });
    expect(outcomeIds(state)).toEqual(["outcome-3", "outcome-1", "outcome-2"]);
  });

  it("saves a draft over its outcome, in place", () => {
    const state = createStateWithWeights(1, 2, 3);

    openOutcomeDraft({ state }, { outcomeId: "outcome-2" });
    expect(state.mode).toBe("editOutcome");
    expect(state.tempOutcome).toEqual({ weight: 2, actions: {} });

    setTempOutcomeWeight({ state }, { weight: 20 });
    setTempOutcomeActions({ state }, { actions: { updateVariable } });
    saveOutcomeDraft({ state });

    expect(state.outcomes).toEqual([
      { id: "outcome-1", weight: 1, actions: {} },
      { id: "outcome-2", weight: 20, actions: { updateVariable } },
      { id: "outcome-3", weight: 3, actions: {} },
    ]);
    expect(state.mode).toBe("current");
    expect(state.currentOutcomeId).toBeUndefined();
  });

  it("adds a new outcome with weight 1 after the others", () => {
    const state = createStateWithWeights(5);

    openOutcomeDraft({ state }, { outcomeId: "outcome-new" });
    expect(state.tempOutcome).toEqual({ weight: 1, actions: {} });
    saveOutcomeDraft({ state });

    expect(state.outcomes).toEqual([
      { id: "outcome-1", weight: 5, actions: {} },
      { id: "outcome-new", weight: 1, actions: {} },
    ]);
  });

  it("closes the draft without saving it", () => {
    const state = createStateWithWeights(5);

    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });
    setTempOutcomeWeight({ state }, { weight: 9 });
    closeOutcomeDraft({ state });

    expect(state.outcomes).toEqual([
      { id: "outcome-1", weight: 5, actions: {} },
    ]);
    expect(state.mode).toBe("current");
    expect(state.tempOutcome).toEqual({ weight: 1, actions: {} });
  });

  it("closes the draft of an outcome that is deleted", () => {
    const state = createStateWithWeights(1, 2);

    openOutcomeDraft({ state }, { outcomeId: "outcome-2" });
    deleteOutcome({ state }, { outcomeId: "outcome-2" });

    expect(outcomeIds(state)).toEqual(["outcome-1"]);
    expect(state.mode).toBe("current");
    expect(state.currentOutcomeId).toBeUndefined();
  });

  // Submit, Add Outcome and Save Outcome stay enabled. Pressing one says
  // what is wrong instead.
  it.each([
    ["no outcomes", []],
    ["every weight 0", [0, 0]],
    ["a weight that is not valid", [70, -1]],
    ["a share Route Engine could never pick", [1, 2 ** -53]],
    ["the largest number of outcomes", Array(100).fill(1)],
    ["more than the largest number of outcomes", Array(101).fill(1)],
  ])("disables no button with %s", (_label, weights) => {
    const state = createStateWithWeights(...weights);
    const viewData = viewDataOf(state);

    expect(viewData).not.toHaveProperty("isSubmitDisabled");
    expect(viewData).not.toHaveProperty("isAddOutcomeDisabled");

    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });
    setTempOutcomeWeight({ state }, { weight: undefined });

    expect(viewDataOf(state)).not.toHaveProperty("isSaveOutcomeDisabled");
  });

  it("shows a notice for a distribution the editor cannot edit, and keeps the outcomes", () => {
    const state = createStateWithWeights(70, 30);
    const outcomes = structuredClone(state.outcomes);

    setDistributionUnsupported({ state });
    const viewData = viewDataOf(state);

    expect(state.outcomes).toEqual(outcomes);
    expect(viewData.isDistributionSupported).toBe(false);
    expect(viewData.outcomes.map((outcome) => outcome.id)).toEqual([
      "outcome-1",
      "outcome-2",
    ]);
    expect(viewData.unsupportedDistributionLabel).toBe(
      "This random action is saved in a format that RouteVN Creator can't edit.",
    );
    expect(viewDataOf(createInitialState()).isDistributionSupported).toBe(true);
  });

  it("shows the breadcrumb of the list and of an outcome", () => {
    const state = createStateWithWeights(1);

    expect(viewDataOf(state).breadcrumb).toEqual([
      { id: "actions", label: "Actions", click: true },
      { id: "current", label: "Random", click: false },
    ]);

    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });

    expect(viewDataOf(state).breadcrumb).toEqual([
      { id: "actions", label: "Actions", click: true },
      { id: "current", label: "Random", click: true },
      { label: "Outcome" },
    ]);
  });

  it("shows the draft's chance with its weight in place of the saved one", () => {
    const state = createStateWithWeights(70, 30);

    openOutcomeDraft({ state }, { outcomeId: "outcome-2" });
    setTempOutcomeWeight({ state }, { weight: 70 });

    expect(viewDataOf(state).tempOutcome).toEqual({
      weight: 70,
      chance: "50%",
    });
  });

  it("shows a new outcome's chance as if it were added", () => {
    const state = createStateWithWeights(1, 2);

    openOutcomeDraft({ state }, { outcomeId: "outcome-new" });

    expect(viewDataOf(state).tempOutcome).toEqual({
      weight: 1,
      chance: "25%",
    });
  });

  it.each([
    ["an empty weight", undefined, "0%"],
    ["a negative weight", -1, "0%"],
    ["NaN", NaN, "0%"],
    ["a weight of 0", 0, "0%"],
    ["a weight of 1", 1, "25%"],
    ["a fractional weight", 0.5, "14.3%"],
  ])("shows the draft's chance for %s", (_label, weight, chance) => {
    const state = createStateWithWeights(1, 3);

    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });
    setTempOutcomeWeight({ state }, { weight });

    expect(viewDataOf(state).tempOutcome.chance).toBe(chance);
  });

  it("leaves the weight field empty and the chance at 0 for an empty weight", () => {
    const state = createStateWithWeights(1);

    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });
    setTempOutcomeWeight({ state }, { weight: undefined });

    expect(viewDataOf(state).tempOutcome).toEqual({
      weight: undefined,
      chance: "0%",
    });
  });

  it("gives the outcome's actions editor the inherited hidden modes and its allowed modes", () => {
    const state = createStateWithWeights(1);
    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });
    setTempOutcomeActions({ state }, { actions: { sectionTransition } });

    const viewData = viewDataOf(state, {
      props: { hiddenModes: ["showConfirmDialog", "hideConfirmDialog"] },
    });

    expect(viewData.hiddenModes).toEqual([
      "showConfirmDialog",
      "hideConfirmDialog",
    ]);
    expect(viewData.outcomeActionAllowedModes).toEqual([
      "sectionTransition",
      "updateVariable",
    ]);
    expect(viewData.outcomeActions).toEqual({ sectionTransition });
    expect(viewDataOf(state).hiddenModes).toEqual([]);
  });

  it("shows English labels", () => {
    const viewData = viewDataOf(createInitialState());

    expect(viewData).toMatchObject({
      actionsLabel: "Actions",
      addOutcomeButton: "+ Add Outcome",
      chanceLabel: "Chance",
      outcomesLabel: "Outcomes",
      saveOutcomeButton: "Save Outcome",
      submitButton: "Submit",
      weightLabel: "Weight",
    });
  });

  it("localizes every label, the breadcrumb and the outcome rows", () => {
    const state = createStateWithWeights(70, 30);
    state.outcomes[1].actions = { sectionTransition };
    showDropdownMenu(
      { state },
      { outcomeId: "outcome-1", position: { x: 0, y: 0 } },
    );
    const japanese = viewDataOf(state, { i18n: JA_I18N });

    expect(japanese).toMatchObject({
      actionsLabel: "アクション",
      addOutcomeButton: "+ 結果を追加",
      chanceLabel: "確率",
      outcomesLabel: "結果",
      saveOutcomeButton: "結果を保存",
      submitButton: "確定",
      unsupportedDistributionLabel:
        "このランダムアクションは、RouteVN Creatorでは編集できない形式で保存されています。",
      weightLabel: "重み",
    });
    expect(japanese.breadcrumb.map((item) => item.label)).toEqual([
      "アクション",
      "ランダム",
    ]);
    expect(japanese.dropdownMenu.items.map((item) => item.label)).toEqual([
      "下へ移動",
      "削除",
    ]);
    expect(
      japanese.outcomes.map(({ summary, actionsSummary }) => ({
        summary,
        actionsSummary,
      })),
    ).toEqual([
      {
        summary: "重み70（70%）",
        actionsSummary: "アクションなし（次の行へ進む）",
      },
      { summary: "重み30（30%）", actionsSummary: "1件のアクション" },
    ]);

    openOutcomeDraft({ state }, { outcomeId: "outcome-1" });
    expect(
      viewDataOf(state, { i18n: JA_I18N }).breadcrumb.map((item) => item.label),
    ).toEqual(["アクション", "ランダム", "結果"]);
  });
});
