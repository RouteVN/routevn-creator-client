import { describe, expect, it } from "vitest";
import {
  canActionsNavigate,
  isNavigationActionType,
  isSectionJumpActionType,
  mergeSubmittedActions,
  upgradeResetStoryActions,
} from "../../src/internal/navigationActions.js";

const sectionTransition = { sceneId: "scene-1", sectionId: "section-2" };
const resetStoryAtSection = { sectionId: "section-3" };
const updateVariable = {
  id: "update-1",
  operations: [{ variableId: "variable-1", op: "set", value: 1 }],
};
const conditionalWith = (...branchActions) => ({
  branches: branchActions.map((actions, index) =>
    index < branchActions.length - 1
      ? { when: { eq: [{ var: "variables.variable-1" }, index] }, actions }
      : { actions },
  ),
});
const randomWith = (...outcomeActions) => ({
  distribution: {
    type: "weighted",
    outcomes: outcomeActions.map((actions, index) => ({
      weight: index + 1,
      actions,
    })),
  },
});

describe("navigationActions", () => {
  it("tells the navigation actions the editors offer from other actions", () => {
    for (const actionType of [
      "nextLine",
      "sectionTransition",
      "resetStoryAtSection",
      "rollbackByOffset",
      "loadSlot",
    ]) {
      expect(isNavigationActionType(actionType)).toBe(true);
    }
    for (const actionType of [
      "conditional",
      "random",
      "updateVariable",
      "pushOverlay",
      "saveSlot",
      "toggleAutoMode",
    ]) {
      expect(isNavigationActionType(actionType)).toBe(false);
    }
  });

  it("knows the actions can navigate from a conditional branch", () => {
    expect(canActionsNavigate({ sectionTransition })).toBe(true);
    expect(
      canActionsNavigate({
        conditional: conditionalWith({ updateVariable }, { nextLine: {} }),
      }),
    ).toBe(true);
    expect(
      canActionsNavigate({
        updateVariable,
        conditional: conditionalWith({ updateVariable }, {}),
      }),
    ).toBe(false);
    expect(canActionsNavigate({})).toBe(false);
  });

  it("knows the actions can navigate from a random outcome", () => {
    expect(
      canActionsNavigate({
        random: randomWith({ updateVariable }, { nextLine: {} }),
      }),
    ).toBe(true);
    expect(
      canActionsNavigate({
        random: randomWith({ sectionTransition }, {}),
      }),
    ).toBe(true);
    expect(
      canActionsNavigate({
        updateVariable,
        random: randomWith({ updateVariable }, {}),
      }),
    ).toBe(false);
    expect(canActionsNavigate({ random: randomWith() })).toBe(false);
  });

  it("does not look for outcomes in a random action of another form", () => {
    expect(
      canActionsNavigate({
        random: {
          distribution: { type: "integer", min: 1, max: 6 },
          variableId: "variable-1",
        },
      }),
    ).toBe(false);
  });

  it("knows the actions can navigate from a random in a branch, and the reverse", () => {
    expect(
      canActionsNavigate({
        conditional: conditionalWith({
          random: randomWith({ updateVariable }, { sectionTransition }),
        }),
      }),
    ).toBe(true);
    expect(
      canActionsNavigate({
        random: randomWith({
          conditional: conditionalWith({ updateVariable }, { nextLine: {} }),
        }),
      }),
    ).toBe(true);
    expect(
      canActionsNavigate({
        random: randomWith({
          conditional: conditionalWith({ updateVariable }, {}),
        }),
      }),
    ).toBe(false);
  });

  it("replaces the navigation action already there with the submitted one", () => {
    expect(
      mergeSubmittedActions(
        { sectionTransition, toggleAutoMode: {} },
        { resetStoryAtSection },
      ),
    ).toEqual({ toggleAutoMode: {}, resetStoryAtSection });
    expect(
      mergeSubmittedActions(
        { nextLine: {}, rollbackByOffset: { offset: -1 } },
        { loadSlot: { slotId: "1" } },
      ),
    ).toEqual({ loadSlot: { slotId: "1" } });
  });

  it("edits a navigation action in place", () => {
    const nextSectionTransition = {
      sceneId: "scene-1",
      sectionId: "section-4",
    };

    expect(
      mergeSubmittedActions(
        { sectionTransition, updateVariable },
        { sectionTransition: nextSectionTransition },
      ),
    ).toEqual({ sectionTransition: nextSectionTransition, updateVariable });
  });

  it("leaves the actions as they are when the submitted ones do not navigate", () => {
    const savedActions = { sectionTransition, resetStoryAtSection };

    expect(mergeSubmittedActions(savedActions, { toggleSkipMode: {} })).toEqual(
      { sectionTransition, resetStoryAtSection, toggleSkipMode: {} },
    );
    expect(
      mergeSubmittedActions(
        { sectionTransition },
        { conditional: conditionalWith({ updateVariable }, {}) },
      ),
    ).toEqual({
      sectionTransition,
      conditional: conditionalWith({ updateVariable }, {}),
    });
  });

  it("takes the navigation out of a conditional's branches, and keeps the rest of them", () => {
    const conditional = conditionalWith(
      { resetStoryAtSection, updateVariable },
      { updateVariable },
    );

    expect(
      mergeSubmittedActions({ conditional, bgm: {} }, { sectionTransition }),
    ).toEqual({
      conditional: conditionalWith({ updateVariable }, { updateVariable }),
      bgm: {},
      sectionTransition,
    });
    // The saved conditional is not changed.
    expect(conditional.branches[0].actions).toEqual({
      resetStoryAtSection,
      updateVariable,
    });
  });

  it("removes the navigation action when a conditional that navigates is submitted", () => {
    const conditional = conditionalWith({ resetStoryAtSection }, {});

    expect(
      mergeSubmittedActions(
        { sectionTransition, updateVariable },
        { conditional },
      ),
    ).toEqual({ updateVariable, conditional });
  });

  it("takes the navigation out of a random's outcomes, and keeps the rest of them", () => {
    const random = randomWith(
      { resetStoryAtSection, updateVariable },
      { sectionTransition },
      { updateVariable },
    );

    expect(
      mergeSubmittedActions({ random, bgm: {} }, { nextLine: {} }),
    ).toEqual({
      random: randomWith({ updateVariable }, {}, { updateVariable }),
      bgm: {},
      nextLine: {},
    });
    // The saved random is not changed.
    expect(random.distribution.outcomes[0].actions).toEqual({
      resetStoryAtSection,
      updateVariable,
    });
    expect(random.distribution.outcomes[1].actions).toEqual({
      sectionTransition,
    });
  });

  it("removes the navigation action when a random that navigates is submitted", () => {
    const random = randomWith({ sectionTransition }, {});

    expect(
      mergeSubmittedActions({ nextLine: {}, updateVariable }, { random }),
    ).toEqual({ updateVariable, random });
  });

  it("leaves the actions as they are when a random that does not navigate is submitted", () => {
    const random = randomWith({ updateVariable }, {});

    expect(mergeSubmittedActions({ sectionTransition }, { random })).toEqual({
      sectionTransition,
      random,
    });
  });

  it("takes the navigation out of a random in a branch, and out of a conditional in an outcome", () => {
    const conditional = conditionalWith(
      { random: randomWith({ sectionTransition, updateVariable }, {}) },
      { updateVariable },
    );
    const random = randomWith(
      { conditional: conditionalWith({ nextLine: {} }, { updateVariable }) },
      { updateVariable },
    );

    expect(
      mergeSubmittedActions({ conditional }, { sectionTransition }),
    ).toEqual({
      conditional: conditionalWith(
        { random: randomWith({ updateVariable }, {}) },
        { updateVariable },
      ),
      sectionTransition,
    });
    expect(mergeSubmittedActions({ random }, { sectionTransition })).toEqual({
      random: randomWith(
        { conditional: conditionalWith({}, { updateVariable }) },
        { updateVariable },
      ),
      sectionTransition,
    });
  });

  it("takes only the navigation out of a random, and keeps every other field", () => {
    const bgm = { resourceId: "music-1" };
    const random = {
      note: "Random One",
      distribution: {
        type: "weighted",
        seed: 7,
        outcomes: [
          {
            weight: 2,
            label: "Outcome One",
            actions: { nextLine: {}, updateVariable },
          },
          { weight: 3, label: "Outcome Two", actions: { bgm } },
        ],
      },
    };

    expect(mergeSubmittedActions({ random }, { sectionTransition })).toEqual({
      random: {
        note: "Random One",
        distribution: {
          type: "weighted",
          seed: 7,
          outcomes: [
            { weight: 2, label: "Outcome One", actions: { updateVariable } },
            { weight: 3, label: "Outcome Two", actions: { bgm } },
          ],
        },
      },
      sectionTransition,
    });
  });

  // The editor never writes these, but a line can hold them.
  it.each([
    [
      "outcomes that are null",
      { distribution: { type: "weighted", outcomes: null } },
    ],
    [
      "outcomes in an object",
      {
        distribution: {
          type: "weighted",
          outcomes: { first: { weight: 1, actions: { nextLine: {} } } },
        },
      },
    ],
    ["no distribution", {}],
    ["no fields at all", null],
  ])("reads a random with %s as one that cannot navigate", (_label, random) => {
    expect(canActionsNavigate({ random })).toBe(false);
    expect(
      mergeSubmittedActions({ random, updateVariable }, { nextLine: {} }),
    ).toEqual({ random, updateVariable, nextLine: {} });
    expect(mergeSubmittedActions({ nextLine: {} }, { random })).toEqual({
      nextLine: {},
      random,
    });
  });

  it("skips a null outcome of a random", () => {
    const navigatingRandom = {
      distribution: {
        type: "weighted",
        outcomes: [null, { weight: 1, actions: { nextLine: {} } }],
      },
    };
    const random = {
      distribution: {
        type: "weighted",
        outcomes: [null, { weight: 1, actions: { updateVariable } }],
      },
    };

    expect(canActionsNavigate({ random: navigatingRandom })).toBe(true);
    expect(canActionsNavigate({ random })).toBe(false);
    expect(
      mergeSubmittedActions({ nextLine: {} }, { random: navigatingRandom }),
    ).toEqual({ random: navigatingRandom });

    const nextActions = mergeSubmittedActions(
      { random },
      { sectionTransition },
    );

    expect(nextActions).toEqual({ random, sectionTransition });
    expect(nextActions.random).toBe(random);
  });

  it("keeps outcomes in a form it cannot write when it takes the navigation out of a random", () => {
    const keptOutcomes = [
      null,
      "text",
      { weight: 2, actions: [] },
      { weight: 1, actions: null },
    ];
    const random = {
      distribution: {
        type: "weighted",
        outcomes: [...keptOutcomes, { weight: 1, actions: { nextLine: {} } }],
      },
    };

    expect(
      canActionsNavigate({
        random: { distribution: { outcomes: [{ actions: null }] } },
      }),
    ).toBe(false);

    const nextActions = mergeSubmittedActions(
      { random },
      { sectionTransition },
    );

    expect(nextActions).toEqual({
      random: {
        distribution: {
          type: "weighted",
          outcomes: [...keptOutcomes, { weight: 1, actions: {} }],
        },
      },
      sectionTransition,
    });
    keptOutcomes.forEach((outcome, index) => {
      expect(nextActions.random.distribution.outcomes[index]).toBe(outcome);
    });
  });

  it("returns the actions it does not change as the same objects", () => {
    const currentActions = { bgm: { resourceId: "music-1" }, nextLine: {} };

    const nextActions = mergeSubmittedActions(currentActions, {
      sectionTransition,
    });

    expect(nextActions.bgm).toBe(currentActions.bgm);
  });
});

describe("upgradeResetStoryActions", () => {
  const sceneIdsBySectionId = {
    "section-2": "scene-1",
    "section-3": "scene-2",
  };
  const upgrade = (value) =>
    upgradeResetStoryActions(value, {
      resolveSceneId: (sectionId) => sceneIdsBySectionId[sectionId],
    });

  it("rewrites a reset as a section transition that resets the story", () => {
    expect(
      upgrade({ resetStoryAtSection: { sectionId: "section-3" } }),
    ).toEqual({
      sectionTransition: {
        sceneId: "scene-2",
        sectionId: "section-3",
        resetStory: true,
      },
    });
  });

  it("keeps the screen transition and the position among the other actions", () => {
    const screen = { animations: { resourceId: "animation-1" } };
    const upgraded = upgrade({
      popOverlay: {},
      resetStoryAtSection: { sectionId: "section-2", screen },
      updateVariable,
    });

    expect(upgraded).toEqual({
      popOverlay: {},
      sectionTransition: {
        sceneId: "scene-1",
        sectionId: "section-2",
        screen,
        resetStory: true,
      },
      updateVariable,
    });
    expect(Object.keys(upgraded)).toEqual([
      "popOverlay",
      "sectionTransition",
      "updateVariable",
    ]);
  });

  it("rewrites resets nested in branches, dialogs, and interaction payloads", () => {
    expect(
      upgrade({
        click: {
          payload: {
            actions: {
              showConfirmDialog: {
                resourceId: "layout-1",
                confirmActions: {
                  popOverlay: {},
                  resetStoryAtSection: { sectionId: "section-2" },
                },
              },
            },
          },
        },
        conditional: conditionalWith(
          { resetStoryAtSection: { sectionId: "section-3" } },
          { updateVariable },
        ),
      }),
    ).toEqual({
      click: {
        payload: {
          actions: {
            showConfirmDialog: {
              resourceId: "layout-1",
              confirmActions: {
                popOverlay: {},
                sectionTransition: {
                  sceneId: "scene-1",
                  sectionId: "section-2",
                  resetStory: true,
                },
              },
            },
          },
        },
      },
      conditional: conditionalWith(
        {
          sectionTransition: {
            sceneId: "scene-2",
            sectionId: "section-3",
            resetStory: true,
          },
        },
        { updateVariable },
      ),
    });
  });

  it("returns the same value when there is nothing to rewrite", () => {
    const actions = {
      sectionTransition,
      conditional: conditionalWith({ updateVariable }, {}),
    };

    expect(upgrade(actions)).toBe(actions);
    expect(upgrade(undefined)).toBeUndefined();
    expect(upgrade("text")).toBe("text");
  });

  it("leaves a reset whose section no longer exists", () => {
    const actions = { resetStoryAtSection: { sectionId: "section-9" } };

    expect(upgrade(actions)).toBe(actions);
  });

  it("leaves a reset that sits next to a section transition", () => {
    const actions = { resetStoryAtSection, sectionTransition };

    expect(upgrade(actions)).toBe(actions);
  });

  it("leaves a reset without a section", () => {
    for (const actions of [
      { resetStoryAtSection: {} },
      { resetStoryAtSection: { sectionId: "" } },
      { resetStoryAtSection: "section-2" },
    ]) {
      expect(upgrade(actions)).toBe(actions);
    }
  });

  it("does not change the value it was given", () => {
    const actions = {
      conditional: conditionalWith(
        { resetStoryAtSection: { sectionId: "section-2" } },
        {},
      ),
    };
    const before = structuredClone(actions);

    upgrade(actions);

    expect(actions).toEqual(before);
  });
});

describe("isSectionJumpActionType", () => {
  it("names the actions that move the story to the start of a section", () => {
    expect(isSectionJumpActionType("sectionTransition")).toBe(true);
    expect(isSectionJumpActionType("resetStoryAtSection")).toBe(true);
  });

  it("leaves out navigation that names no section to start", () => {
    expect(isSectionJumpActionType("jumpToLine")).toBe(false);
    expect(isSectionJumpActionType("nextLine")).toBe(false);
    expect(isSectionJumpActionType("dialogue")).toBe(false);
  });

  it("only names navigation actions", () => {
    for (const actionType of ["sectionTransition", "resetStoryAtSection"]) {
      expect(isNavigationActionType(actionType)).toBe(true);
    }
  });
});
