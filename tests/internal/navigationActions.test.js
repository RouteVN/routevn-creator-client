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
