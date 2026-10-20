import { describe, expect, it } from "vitest";
import {
  canActionsNavigate,
  isNavigationActionType,
  mergeSubmittedActions,
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

  it("returns the actions it does not change as the same objects", () => {
    const currentActions = { bgm: { resourceId: "music-1" }, nextLine: {} };

    const nextActions = mergeSubmittedActions(currentActions, {
      sectionTransition,
    });

    expect(nextActions.bgm).toBe(currentActions.bgm);
  });
});
