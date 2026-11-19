import { describe, expect, it, vi } from "vitest";
import * as randomHandlers from "../../src/components/commandLineRandom/commandLineRandom.handlers.js";
import * as randomStore from "../../src/components/commandLineRandom/commandLineRandom.store.js";
import { EN_I18N, JA_I18N, PT_I18N } from "../support/i18n.js";
import { mountHandlers } from "../support/mountHandlers.js";
import { withSelectors } from "../support/storeFake.js";

const {
  handleAddOutcomeClick,
  handleBreadcrumbClick,
  handleDropdownMenuClickItem,
  handleDropdownMenuClose,
  handleOutcomeActionsChange,
  handleOutcomeActionsDelete,
  handleOutcomeClick,
  handleOutcomeContextMenu,
  handleOutcomeMenuButtonClick,
  handleOutcomeMenuButtonKeyDown,
  handleSaveOutcomeClick,
  handleSubmitClick,
  handleWeightInputChange,
} = randomHandlers;

const EN_COPY = EN_I18N.commandLinePage;
const JA_COPY = JA_I18N.commandLinePage;

const sectionTransition = {
  sceneId: "scene-1",
  sectionId: "section-2",
};

const updateVariable = {
  id: "update-1",
  operations: [{ variableId: "variable-1", op: "set", value: 1 }],
};

// Binds the real store actions and selectors to a plain state.
const createStore = (state) => {
  const actions = Object.fromEntries(
    Object.entries(randomStore)
      .filter(
        ([name]) => !name.startsWith("select") && name !== "createInitialState",
      )
      .map(([name, action]) => [name, (payload) => action({ state }, payload)]),
  );
  return withSelectors({ getState: () => state, ...actions }, randomStore);
};

const weightedRandom = (...outcomes) => ({
  distribution: { type: "weighted", outcomes },
});

// Mounts the editor with these props, as the actions dialog does.
const mountRandom = (props = {}, { i18n = EN_I18N } = {}) => {
  const state = randomStore.createInitialState();
  const dispatchedEvents = [];
  const deps = {
    appService: { showAlert: vi.fn() },
    dispatchEvent: (event) => dispatchedEvents.push(event),
    i18n,
    props,
    render: vi.fn(),
    store: createStore(state),
  };

  mountHandlers(randomHandlers, deps);
  return { deps, dispatchedEvents, state };
};

const clickEvent = () => ({ _event: { stopPropagation: vi.fn() } });

const outcomeEvent = (outcomeId, fields = {}) => ({
  _event: {
    currentTarget: {
      dataset: { outcomeId },
      getBoundingClientRect: () => ({ right: 320, bottom: 240 }),
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...fields,
  },
});

const weightEvent = (value) => ({ _event: { detail: { value } } });

const outcomeIds = (state) => state.outcomes.map((outcome) => outcome.id);
const outcomeWeights = (state) =>
  state.outcomes.map((outcome) => outcome.weight);

const outcomesWithWeights = (...weights) =>
  weights.map((weight) => ({ weight, actions: {} }));

const mountWithWeights = (...weights) =>
  mountRandom({ random: weightedRandom(...outcomesWithWeights(...weights)) });

// The largest number of outcomes, each setting a variable to a long text: far
// more than a line's actions can hold.
const oversizedOutcomes = () =>
  Array.from({ length: 100 }, () => ({
    weight: 1,
    actions: {
      updateVariable: {
        id: "update-1",
        operations: [
          { variableId: "variable-1", op: "set", value: "あ".repeat(300) },
        ],
      },
    },
  }));

// Each reason Submit refuses the outcomes, with the catalog key and English
// text of its warning.
const SUBMIT_WARNINGS = [
  ["no outcomes", [], "addOutcomeRequired", "Please add at least one outcome."],
  [
    "every weight 0",
    outcomesWithWeights(0, 0),
    "positiveOutcomeWeightRequired",
    "Give at least one outcome a weight greater than 0.",
  ],
  [
    "a negative weight",
    outcomesWithWeights(70, -1),
    "outcomeWeightInvalid",
    "Each weight must be 0 or greater.",
  ],
  [
    "a weight as text",
    outcomesWithWeights(70, "30"),
    "outcomeWeightInvalid",
    "Each weight must be 0 or greater.",
  ],
  [
    "too many outcomes",
    outcomesWithWeights(...Array(101).fill(1)),
    "outcomeLimitReached",
    "A random action can have at most 100 outcomes.",
  ],
  [
    "a share Route Engine could never pick",
    outcomesWithWeights(1, 2 ** -53),
    "outcomeWeightTooSmall",
    "One outcome's weight is so small compared with the largest weight that the outcome can never be picked. Raise it or set it to 0.",
  ],
  [
    "an action too large to save",
    oversizedOutcomes(),
    "randomActionTooLarge",
    "This random action is too large to save. Use fewer outcomes, or fewer actions in them.",
  ],
];

// Random actions the editor cannot edit. Where the outcomes are a list, a
// valid outcome comes first, so that every outcome has to be checked.
const UNSUPPORTED_RANDOMS = [
  [
    "an integer distribution",
    {
      distribution: { type: "integer", min: 1, max: 6 },
      variableId: "variable-1",
    },
  ],
  ["no distribution", {}],
  [
    "weighted outcomes that are not a list",
    { distribution: { type: "weighted" } },
  ],
  [
    "weighted outcomes in an object",
    {
      distribution: {
        type: "weighted",
        outcomes: { first: { weight: 1, actions: {} } },
      },
    },
  ],
  [
    "another type with a valid outcomes list",
    {
      distribution: {
        type: "other",
        outcomes: [{ weight: 1, actions: { sectionTransition } }],
      },
    },
  ],
  ["a null outcome", weightedRandom({ weight: 1, actions: {} }, null)],
  ["an outcome as text", weightedRandom({ weight: 1, actions: {} }, "outcome")],
  [
    "an outcome as a list",
    weightedRandom({ weight: 1, actions: {} }, [{ weight: 1, actions: {} }]),
  ],
  [
    "outcome actions as a list",
    weightedRandom({ weight: 1, actions: {} }, { weight: 1, actions: [] }),
  ],
  [
    "outcome actions as text",
    weightedRandom({ weight: 1, actions: {} }, { weight: 1, actions: "abc" }),
  ],
  [
    "null outcome actions",
    weightedRandom({ weight: 1, actions: {} }, { weight: 1, actions: null }),
  ],
];

describe("commandLineRandom.handlers", () => {
  it("loads the outcomes of the action, each with its own editor id", () => {
    const { state } = mountRandom({
      random: weightedRandom(
        { weight: 70, actions: { sectionTransition } },
        { weight: 30, actions: {} },
      ),
    });

    expect(state.isDistributionSupported).toBe(true);
    expect(
      state.outcomes.map(({ weight, actions }) => ({ weight, actions })),
    ).toEqual([
      { weight: 70, actions: { sectionTransition } },
      { weight: 30, actions: {} },
    ]);
    const ids = outcomeIds(state);
    expect(ids).toEqual([expect.any(String), expect.any(String)]);
    expect(new Set(ids).size).toBe(2);
  });

  it("loads an outcome saved without actions as one with no actions", () => {
    const { deps, dispatchedEvents, state } = mountRandom({
      random: weightedRandom({ weight: 1 }, { weight: 2, actions: {} }),
    });

    expect(state.isDistributionSupported).toBe(true);
    expect(state.outcomes.map((outcome) => outcome.actions)).toEqual([{}, {}]);

    handleSubmitClick(deps, clickEvent());

    expect(dispatchedEvents[0].detail.random).toEqual(
      weightedRandom({ weight: 1, actions: {} }, { weight: 2, actions: {} }),
    );
  });

  it("starts with no outcomes for a new Random", () => {
    const { state } = mountRandom();

    expect(state.outcomes).toEqual([]);
    expect(state.isDistributionSupported).toBe(true);
    expect(state.mode).toBe("current");
  });

  it.each(UNSUPPORTED_RANDOMS)(
    "keeps %s out of the editor and never submits it",
    (_label, random) => {
      const savedRandom = structuredClone(random);
      const { deps, dispatchedEvents, state } = mountRandom({ random });

      expect(state.isDistributionSupported).toBe(false);
      expect(state.outcomes).toEqual([]);

      handleSubmitClick(deps, clickEvent());

      expect(dispatchedEvents).toEqual([]);
      expect(random).toEqual(savedRandom);
    },
  );

  it("submits the Route Engine weighted distribution without editor ids", () => {
    const { deps, dispatchedEvents } = mountRandom({
      random: weightedRandom(
        { weight: 70, actions: { sectionTransition } },
        { weight: 30, actions: {} },
      ),
    });
    const event = clickEvent();

    handleSubmitClick(deps, event);

    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(event._event.stopPropagation).toHaveBeenCalledOnce();
    expect(dispatchedEvents).toHaveLength(1);
    const [submitEvent] = dispatchedEvents;
    expect(submitEvent.type).toBe("submit");
    expect(submitEvent.bubbles).toBe(true);
    expect(submitEvent.composed).toBe(true);
    expect(submitEvent.detail).toEqual({
      random: {
        distribution: {
          type: "weighted",
          outcomes: [
            { weight: 70, actions: { sectionTransition } },
            { weight: 30, actions: {} },
          ],
        },
      },
    });
  });

  it.each(SUBMIT_WARNINGS)(
    "warns about %s and submits nothing",
    (_label, outcomes, _key, message) => {
      const { deps, dispatchedEvents, state } = mountRandom({
        random: weightedRandom(...outcomes),
      });
      const savedOutcomes = structuredClone(state.outcomes);
      const event = clickEvent();

      handleSubmitClick(deps, event);

      expect(event._event.stopPropagation).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message,
        title: "Warning",
      });
      expect(dispatchedEvents).toEqual([]);
      expect(state.outcomes).toEqual(savedOutcomes);
      expect(state.mode).toBe("current");
      expect(deps.render).not.toHaveBeenCalled();
    },
  );

  it.each(SUBMIT_WARNINGS)(
    "warns about %s in Japanese",
    (_label, outcomes, key) => {
      const { deps } = mountRandom(
        { random: weightedRandom(...outcomes) },
        { i18n: JA_I18N },
      );

      handleSubmitClick(deps, clickEvent());

      expect(JA_COPY[key]).toEqual(expect.any(String));
      expect(JA_COPY[key]).not.toBe(EN_COPY[key]);
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: JA_COPY[key],
        title: JA_COPY.Warning,
      });
    },
  );

  it("warns in Portuguese", () => {
    const { deps } = mountRandom(
      { random: weightedRandom(...outcomesWithWeights(...Array(101).fill(1))) },
      { i18n: PT_I18N },
    );

    handleSubmitClick(deps, clickEvent());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Uma ação aleatória pode ter, no máximo, 100 resultados.",
      title: "Aviso",
    });
  });

  it("adds an outcome with weight 1 and saves it after the others", () => {
    const { deps, dispatchedEvents, state } = mountWithWeights(70);
    const event = clickEvent();

    handleAddOutcomeClick(deps, event);

    expect(event._event.stopPropagation).toHaveBeenCalledOnce();
    expect(state.mode).toBe("editOutcome");
    expect(state.tempOutcome).toEqual({ weight: 1, actions: {} });

    handleWeightInputChange(deps, weightEvent(30));
    handleOutcomeActionsChange(deps, {
      _event: { detail: { sectionTransition } },
    });
    const saveEvent = clickEvent();
    handleSaveOutcomeClick(deps, saveEvent);

    expect(saveEvent._event.stopPropagation).toHaveBeenCalledOnce();
    expect(state.mode).toBe("current");
    expect(
      state.outcomes.map(({ weight, actions }) => ({ weight, actions })),
    ).toEqual([
      { weight: 70, actions: {} },
      { weight: 30, actions: { sectionTransition } },
    ]);
    const ids = outcomeIds(state);
    expect(ids).toEqual([expect.any(String), expect.any(String)]);
    expect(new Set(ids).size).toBe(2);

    handleSubmitClick(deps, clickEvent());
    expect(dispatchedEvents[0].detail.random.distribution.outcomes).toEqual([
      { weight: 70, actions: {} },
      { weight: 30, actions: { sectionTransition } },
    ]);
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(4);
  });

  it("opens a new outcome one below the largest number", () => {
    const { deps, state } = mountWithWeights(...Array(99).fill(1));

    handleAddOutcomeClick(deps, clickEvent());

    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(state.mode).toBe("editOutcome");
    expect(state.currentOutcomeId).toEqual(expect.any(String));
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("warns instead of opening a new outcome at the largest number", () => {
    const { deps, state } = mountWithWeights(...Array(100).fill(1));
    const event = clickEvent();

    handleAddOutcomeClick(deps, event);

    expect(event._event.stopPropagation).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "A random action can have at most 100 outcomes.",
      title: "Warning",
    });
    expect(state.mode).toBe("current");
    expect(state.currentOutcomeId).toBeUndefined();
    expect(state.outcomes).toHaveLength(100);
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("warns in Japanese at the largest number of outcomes", () => {
    const { deps } = mountRandom(
      { random: weightedRandom(...outcomesWithWeights(...Array(100).fill(1))) },
      { i18n: JA_I18N },
    );

    handleAddOutcomeClick(deps, clickEvent());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: JA_COPY.outcomeLimitReached,
      title: JA_COPY.Warning,
    });
  });

  it("edits an outcome in place", () => {
    const { deps, state } = mountRandom({
      random: weightedRandom(
        { weight: 1, actions: {} },
        { weight: 2, actions: { updateVariable } },
        { weight: 3, actions: {} },
      ),
    });
    const ids = outcomeIds(state);

    handleOutcomeClick(deps, outcomeEvent(ids[1]));

    expect(state.mode).toBe("editOutcome");
    expect(state.tempOutcome).toEqual({
      weight: 2,
      actions: { updateVariable },
    });

    handleWeightInputChange(deps, weightEvent(20));
    handleSaveOutcomeClick(deps, clickEvent());

    expect(outcomeIds(state)).toEqual(ids);
    expect(outcomeWeights(state)).toEqual([1, 20, 3]);
    expect(state.outcomes[1].actions).toEqual({ updateVariable });
    expect(state.mode).toBe("current");
  });

  // rtgl-input-number sends null for an empty field, and shows a negative
  // value as its minimum.
  it.each([
    [-5, 0],
    [null, undefined],
    [2.5, 2.5],
    [0, 0],
    [40, 40],
  ])("keeps %s from the weight field as %s", (value, weight) => {
    const { deps, state } = mountWithWeights(5);

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleWeightInputChange(deps, weightEvent(value));

    expect(state.tempOutcome.weight).toBe(weight);
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("discards the draft when Random in the breadcrumb is clicked", () => {
    const { deps, dispatchedEvents, state } = mountWithWeights(1, 2);
    const ids = outcomeIds(state);

    handleOutcomeClick(deps, outcomeEvent(ids[0]));
    handleWeightInputChange(deps, weightEvent(50));
    handleBreadcrumbClick(deps, { _event: { detail: { id: "current" } } });

    expect(state.mode).toBe("current");
    expect(outcomeWeights(state)).toEqual([1, 2]);

    handleAddOutcomeClick(deps, clickEvent());
    handleBreadcrumbClick(deps, { _event: { detail: { id: "current" } } });

    expect(state.outcomes).toHaveLength(2);
    expect(dispatchedEvents).toEqual([]);
  });

  it("goes back to the actions list from the breadcrumb without bubbling", () => {
    const { deps, dispatchedEvents } = mountWithWeights(1);

    handleBreadcrumbClick(deps, { _event: { detail: { id: "actions" } } });

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("back-to-actions");
    expect(dispatchedEvents[0].bubbles).toBe(false);
  });

  it("warns instead of saving an outcome whose weight field is empty", () => {
    const { deps, state } = mountWithWeights(5);

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleWeightInputChange(deps, weightEvent(null));
    const renders = deps.render.mock.calls.length;
    const event = clickEvent();

    handleSaveOutcomeClick(deps, event);

    expect(event._event.stopPropagation).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Each weight must be 0 or greater.",
      title: "Warning",
    });
    expect(state.mode).toBe("editOutcome");
    expect(state.tempOutcome.weight).toBeUndefined();
    expect(outcomeWeights(state)).toEqual([5]);
    expect(deps.render).toHaveBeenCalledTimes(renders);
  });

  it("warns in Japanese about an outcome whose weight field is empty", () => {
    const { deps, state } = mountRandom(
      { random: weightedRandom(...outcomesWithWeights(5)) },
      { i18n: JA_I18N },
    );

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleWeightInputChange(deps, weightEvent(null));
    handleSaveOutcomeClick(deps, clickEvent());

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: JA_COPY.outcomeWeightInvalid,
      title: JA_COPY.Warning,
    });
  });

  it("opens the outcome menu from its button and from a right-click", () => {
    const { deps, state } = mountWithWeights(1, 2);
    const [firstId, secondId] = outcomeIds(state);
    const buttonEvent = outcomeEvent(secondId);

    handleOutcomeMenuButtonClick(deps, buttonEvent);

    expect(buttonEvent._event.stopPropagation).toHaveBeenCalledOnce();
    expect(state.dropdownMenu).toMatchObject({
      isOpen: true,
      outcomeId: secondId,
      position: { x: 320, y: 240 },
    });
    expect(state.dropdownMenu.items.map((item) => item.value)).toEqual([
      "move-up",
      "delete",
    ]);

    handleDropdownMenuClose(deps);
    expect(state.dropdownMenu.isOpen).toBe(false);

    const contextMenuEvent = outcomeEvent(firstId, {
      clientX: 12,
      clientY: 34,
    });
    handleOutcomeContextMenu(deps, contextMenuEvent);

    expect(contextMenuEvent._event.preventDefault).toHaveBeenCalledOnce();
    expect(state.dropdownMenu).toMatchObject({
      isOpen: true,
      outcomeId: firstId,
      position: { x: 12, y: 34 },
    });
    expect(state.dropdownMenu.items.map((item) => item.value)).toEqual([
      "move-down",
      "delete",
    ]);
  });

  it.each([
    ["move-up", 1, [2, 1, 3]],
    ["move-down", 1, [1, 3, 2]],
    ["delete", 1, [1, 3]],
    ["move-up", 0, [1, 2, 3]],
    ["move-down", 2, [1, 2, 3]],
    ["delete", 0, [2, 3]],
    ["delete", 2, [1, 2]],
  ])(
    "runs %s from the menu of the outcome at %s",
    (value, index, expectedWeights) => {
      const { deps, state } = mountWithWeights(1, 2, 3);

      handleOutcomeMenuButtonClick(
        deps,
        outcomeEvent(outcomeIds(state)[index]),
      );
      handleDropdownMenuClickItem(deps, {
        _event: { detail: { item: { value } } },
      });

      expect(outcomeWeights(state)).toEqual(expectedWeights);
      expect(state.dropdownMenu.isOpen).toBe(false);
      expect(state.dropdownMenu.outcomeId).toBeUndefined();
    },
  );

  it("moves and deletes the same outcome with keyboard shortcuts", () => {
    const { deps, state } = mountWithWeights(1, 2, 3);
    const lastId = outcomeIds(state)[2];
    const pressShortcut = (key) => {
      const event = outcomeEvent(lastId, { key });
      handleOutcomeMenuButtonKeyDown(deps, event);
      return event._event;
    };

    pressShortcut("ArrowDown");
    expect(outcomeWeights(state)).toEqual([1, 2, 3]);

    pressShortcut("ArrowUp");
    pressShortcut("ArrowUp");
    expect(outcomeWeights(state)).toEqual([3, 1, 2]);

    const firstRowUp = pressShortcut("ArrowUp");
    expect(outcomeWeights(state)).toEqual([3, 1, 2]);
    expect(firstRowUp.preventDefault).toHaveBeenCalledOnce();
    expect(firstRowUp.stopPropagation).toHaveBeenCalledOnce();

    pressShortcut("ArrowDown");
    expect(outcomeWeights(state)).toEqual([1, 3, 2]);

    pressShortcut("Delete");
    expect(outcomeWeights(state)).toEqual([1, 2]);
    expect(deps.render).toHaveBeenCalledTimes(6);
  });

  it.each(["Enter", " ", "a", "Backspace"])(
    "leaves the %j key to the menu button",
    (key) => {
      const { deps, state } = mountWithWeights(1, 2);
      const event = outcomeEvent(outcomeIds(state)[1], { key });

      handleOutcomeMenuButtonKeyDown(deps, event);

      expect(event._event.preventDefault).not.toHaveBeenCalled();
      expect(event._event.stopPropagation).not.toHaveBeenCalled();
      expect(outcomeWeights(state)).toEqual([1, 2]);
      expect(deps.render).not.toHaveBeenCalled();
    },
  );

  it("replaces the draft's section transition with a submitted one", () => {
    const { deps, state } = mountRandom({
      random: weightedRandom({
        weight: 1,
        actions: { sectionTransition, updateVariable },
      }),
    });
    const nextSectionTransition = {
      sceneId: "scene-1",
      sectionId: "section-3",
    };

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleOutcomeActionsChange(deps, {
      _event: { detail: { sectionTransition: nextSectionTransition } },
    });

    expect(state.tempOutcome.actions).toEqual({
      updateVariable,
      sectionTransition: nextSectionTransition,
    });
  });

  it("replaces a legacy reset in the draft with a submitted section transition", () => {
    const { deps, state } = mountRandom({
      random: weightedRandom({
        weight: 1,
        actions: {
          resetStoryAtSection: { sectionId: "section-2" },
          updateVariable,
        },
      }),
    });
    const resetTransition = { ...sectionTransition, resetStory: true };

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleOutcomeActionsChange(deps, {
      _event: { detail: { sectionTransition: resetTransition } },
    });

    expect(state.tempOutcome.actions).toEqual({
      updateVariable,
      sectionTransition: resetTransition,
    });
  });

  it("keeps the draft's section transition when other actions are submitted", () => {
    const { deps, state } = mountRandom({
      random: weightedRandom({ weight: 1, actions: { sectionTransition } }),
    });

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleOutcomeActionsChange(deps, {
      _event: { detail: { updateVariable } },
    });

    expect(state.tempOutcome.actions).toEqual({
      sectionTransition,
      updateVariable,
    });
  });

  it("deletes an action from the draft only", () => {
    const { deps, state } = mountRandom({
      random: weightedRandom({
        weight: 1,
        actions: { sectionTransition, updateVariable },
      }),
    });

    handleOutcomeClick(deps, outcomeEvent(outcomeIds(state)[0]));
    handleOutcomeActionsDelete(deps, {
      _event: { detail: { actionType: "sectionTransition" } },
    });

    expect(state.tempOutcome.actions).toEqual({ updateVariable });
    expect(state.outcomes[0].actions).toEqual({
      sectionTransition,
      updateVariable,
    });
  });
});
