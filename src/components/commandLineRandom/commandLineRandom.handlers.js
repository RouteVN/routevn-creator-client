import { generateId } from "../../internal/id.js";
import { mergeSubmittedActions } from "../../internal/navigationActions.js";
import { isPlainObject } from "../../internal/importPackages.js";
import {
  isValidOutcomeWeight,
  MAX_RANDOM_OUTCOMES,
  toRandomAction,
  validateRandomOutcomes,
} from "../../internal/randomActions.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

// The editor writes only weighted distributions whose outcomes are objects
// with object actions. Anything else, such as the older integer form, is kept
// as it is.
const isEditableRandom = (random) =>
  random.distribution?.type === "weighted" &&
  Array.isArray(random.distribution.outcomes) &&
  random.distribution.outcomes.every(
    (outcome) =>
      isPlainObject(outcome) &&
      (outcome.actions === undefined || isPlainObject(outcome.actions)),
  );

// Each outcome gets an id for its row while it is edited. Submit leaves the
// ids out.
const toEditorOutcomes = (outcomes) =>
  outcomes.map((outcome) => ({
    id: generateId(),
    weight: outcome.weight,
    actions: outcome.actions ?? {},
  }));

// The keys that move an outcome from its menu button. Delete deletes it.
const MENU_BUTTON_MOVE_DIRECTIONS = {
  ArrowUp: "up",
  ArrowDown: "down",
};

const showWarning = ({ appService, i18n }, message) => {
  const copy = selectCommandLineCopy(i18n);
  appService.showAlert({
    message: localizeCommandLineText(message, copy),
    title: localizeCommandLineText("Warning", copy),
  });
};

export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  const { random } = props;

  if (random === undefined) {
    return;
  }

  if (!isEditableRandom(random)) {
    store.setDistributionUnsupported();
    return;
  }

  store.setOutcomes({
    outcomes: toEditorOutcomes(random.distribution.outcomes),
  });
};

export const handleAddOutcomeClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;

  if (store.selectOutcomes().length >= MAX_RANDOM_OUTCOMES) {
    showWarning(deps, "A random action can have at most 100 outcomes.");
    return;
  }

  store.openOutcomeDraft({ outcomeId: generateId() });
  render();
};

export const handleOutcomeClick = (deps, payload) => {
  const { store, render } = deps;
  const { outcomeId } = payload._event.currentTarget.dataset;

  store.openOutcomeDraft({ outcomeId });
  render();
};

export const handleOutcomeContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;
  const { clientX, clientY, currentTarget } = payload._event;

  store.showDropdownMenu({
    position: { x: clientX, y: clientY },
    outcomeId: currentTarget.dataset.outcomeId,
  });
  render();
};

export const handleOutcomeMenuButtonClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const { currentTarget } = payload._event;
  const rect = currentTarget.getBoundingClientRect();

  store.showDropdownMenu({
    position: { x: rect.right, y: rect.bottom },
    outcomeId: currentTarget.dataset.outcomeId,
  });
  render();
};

export const handleOutcomeMenuButtonKeyDown = (deps, payload) => {
  const { store, render } = deps;
  const { key, currentTarget } = payload._event;
  const direction = MENU_BUTTON_MOVE_DIRECTIONS[key];

  if (!direction && key !== "Delete") {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();
  const { outcomeId } = currentTarget.dataset;

  if (direction) {
    store.moveOutcome({ outcomeId, direction });
  } else {
    store.deleteOutcome({ outcomeId });
  }
  render();
};

// rtgl-input-number sends null for an empty field. It shows a negative value
// as its minimum, 0, so the draft keeps 0 as well.
export const handleWeightInputChange = (deps, payload) => {
  const { store, render } = deps;
  const { value } = payload._event.detail;

  store.setTempOutcomeWeight({
    weight: value === null ? undefined : Math.max(0, value),
  });
  render();
};

export const handleOutcomeActionsChange = (deps, payload) => {
  const { store, render } = deps;

  store.setTempOutcomeActions({
    actions: mergeSubmittedActions(
      store.selectTempOutcomeActions(),
      payload._event.detail,
    ),
  });
  render();
};

export const handleOutcomeActionsDelete = (deps, payload) => {
  const { store, render } = deps;
  const { actionType } = payload._event.detail;
  const actions = { ...store.selectTempOutcomeActions() };

  delete actions[actionType];
  store.setTempOutcomeActions({ actions });
  render();
};

// The outcome's actions editor closed its own dialog; the outcome stays open.
export const handleNestedActionsClose = (deps) => {
  const { render } = deps;
  render();
};

export const handleSaveOutcomeClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;

  if (!isValidOutcomeWeight(store.selectTempOutcome().weight)) {
    showWarning(deps, "Each weight must be 0 or greater.");
    return;
  }

  store.saveOutcomeDraft();
  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { dispatchEvent, store } = deps;
  const outcomes = store.selectOutcomes();
  const problem = validateRandomOutcomes(outcomes);
  if (problem) {
    showWarning(deps, problem);
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        random: toRandomAction(outcomes),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcrumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const { id } = payload._event.detail;

  if (id === "actions") {
    dispatchEvent(new CustomEvent("back-to-actions", { detail: {} }));
    return;
  }

  if (id === "current") {
    store.closeOutcomeDraft();
    render();
  }
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { value } = payload._event.detail.item;
  const outcomeId = store.selectDropdownMenuOutcomeId();

  store.hideDropdownMenu();

  if (value === "move-up") {
    store.moveOutcome({ outcomeId, direction: "up" });
  } else if (value === "move-down") {
    store.moveOutcome({ outcomeId, direction: "down" });
  } else if (value === "delete") {
    store.deleteOutcome({ outcomeId });
  }
  render();
};
