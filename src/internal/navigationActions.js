// Route Engine runs at most one navigation action per action batch. It
// refuses a batch that holds two, and one whose conditional branch navigates
// while the batch has a navigation action of its own. These are the action
// types of its navigation phase (route-engine-js 1.51.0), which it does not
// export.
export const NAVIGATION_ACTION_TYPES = Object.freeze([
  "loadSlot",
  "rollbackByOffset",
  "rollbackToLine",
  "resetStoryAtSection",
  "sectionTransition",
  "jumpToLine",
  "startSceneReplay",
  "exitSceneReplay",
  "nextLine",
  "nextLineFromSystem",
]);

const NAVIGATION_ACTION_TYPE_SET = new Set(NAVIGATION_ACTION_TYPES);

export const isNavigationActionType = (actionType) =>
  NAVIGATION_ACTION_TYPE_SET.has(actionType);

// The navigation actions that move the story to the first line of the section
// named in their `sectionId`.
const SECTION_JUMP_ACTION_TYPE_SET = new Set([
  "sectionTransition",
  "resetStoryAtSection",
]);

export const isSectionJumpActionType = (actionType) =>
  SECTION_JUMP_ACTION_TYPE_SET.has(actionType);

// Whether running the actions can navigate: they hold a navigation action, or
// a conditional with a branch that can.
export const canActionsNavigate = (actions = {}) =>
  Object.entries(actions).some(
    ([actionType, action]) =>
      isNavigationActionType(actionType) ||
      (actionType === "conditional" &&
        action.branches?.some((branch) => canActionsNavigate(branch.actions))),
  );

const removeNavigationActions = (actions = {}) => {
  const nextActions = {};
  for (const [actionType, action] of Object.entries(actions)) {
    if (isNavigationActionType(actionType)) {
      continue;
    }

    if (
      actionType === "conditional" &&
      canActionsNavigate({ conditional: action })
    ) {
      // Only the navigation goes: the branches keep their other actions.
      nextActions.conditional = {
        ...action,
        branches: action.branches.map((branch) => ({
          ...branch,
          actions: removeNavigationActions(branch.actions),
        })),
      };
      continue;
    }

    nextActions[actionType] = action;
  }
  return nextActions;
};

// Applies the actions an actions editor submitted over the current ones.
// Submitted actions that can navigate replace every navigation action the
// current ones hold, also in a conditional's branches, so that the set never
// runs two. Submitting other actions leaves the current ones as they are.
export const mergeSubmittedActions = (currentActions, submittedActions) => {
  const keptActions = canActionsNavigate(submittedActions)
    ? removeNavigationActions(currentActions)
    : currentActions;
  return {
    ...keptActions,
    ...submittedActions,
  };
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const canUpgradeResetStoryAction = (actions, resolveSceneId) => {
  const resetAction = actions.resetStoryAtSection;
  return (
    isPlainObject(resetAction) &&
    typeof resetAction.sectionId === "string" &&
    resetAction.sectionId.length > 0 &&
    // Two navigation actions in one set is already invalid for Route Engine.
    // Which one the author meant is not ours to guess.
    actions.sectionTransition === undefined &&
    resolveSceneId(resetAction.sectionId) !== undefined
  );
};

// Rewrites every deprecated resetStoryAtSection action inside the value, at
// any depth, as a sectionTransition that resets the story. Route Engine runs
// both the same way. A reset whose section no longer exists is left as it is.
// Returns the value itself when it holds nothing to rewrite.
export const upgradeResetStoryActions = (value, { resolveSceneId }) => {
  if (Array.isArray(value)) {
    let changed = false;
    const nextItems = value.map((item) => {
      const nextItem = upgradeResetStoryActions(item, { resolveSceneId });
      changed = changed || nextItem !== item;
      return nextItem;
    });
    return changed ? nextItems : value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const upgradesResetAction = canUpgradeResetStoryAction(value, resolveSceneId);
  let changed = false;
  const nextValue = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "resetStoryAtSection" && upgradesResetAction) {
      // Takes the place of the action it replaces, so action order is kept.
      nextValue.sectionTransition = {
        sceneId: resolveSceneId(entry.sectionId),
        ...upgradeResetStoryActions(entry, { resolveSceneId }),
        resetStory: true,
      };
      changed = true;
      continue;
    }

    const nextEntry = upgradeResetStoryActions(entry, { resolveSceneId });
    changed = changed || nextEntry !== entry;
    nextValue[key] = nextEntry;
  }
  return changed ? nextValue : value;
};
