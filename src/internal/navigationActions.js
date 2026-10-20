// Route Engine runs at most one navigation action per action batch. It
// refuses a batch that holds two, and one whose conditional branch navigates
// while the batch has a navigation action of its own. These are the action
// types of its navigation phase (route-engine-js 1.49.0), which it does not
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
