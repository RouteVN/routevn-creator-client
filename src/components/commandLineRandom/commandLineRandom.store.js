import { formatNumber } from "../../internal/dates.js";
import { getOutcomeChancePercents } from "../../internal/randomActions.js";
import {
  formatCommandLineActionCount,
  formatCommandLineCopy,
  localizeCommandLineBreadcrumb,
  localizeCommandLineDropdownMenu,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

// The actions an outcome can hold, as in a conditional's branches.
const OUTCOME_ACTION_ALLOWED_MODES = ["sectionTransition", "updateVariable"];

const NEW_OUTCOME_WEIGHT = 1;

const createEmptyTempOutcome = () => ({
  weight: NEW_OUTCOME_WEIGHT,
  actions: {},
});

const getOutcomeDropdownMenuItems = (outcomes, outcomeId) => {
  const index = outcomes.findIndex((outcome) => outcome.id === outcomeId);
  const items = [];

  if (index > 0) {
    items.push({ label: "Move Up", type: "item", value: "move-up" });
  }

  if (index >= 0 && index < outcomes.length - 1) {
    items.push({ label: "Move Down", type: "item", value: "move-down" });
  }

  items.push({ label: "Delete", type: "item", value: "delete" });
  return items;
};

// Chances arrive rounded by getOutcomeChancePercents, which can keep more
// digits than formatPercent's two decimals, so every digit is shown in the
// locale's percent template.
const formatChance = (percent, dateTime = {}) =>
  (dateTime.percent ?? "{value}%").replaceAll("{value}", () =>
    formatNumber(percent, dateTime),
  );

// The weights the weight select offers.
const WEIGHT_CHOICES = Array.from({ length: 100 }, (_, index) => index + 1);

// The options of the weight select: the whole numbers from 1 to 100, in the
// locale's digits. A saved weight outside them, such as 0 or 250, is added in
// order, so that the select shows it and keeps it until another is picked.
const getWeightOptions = (weight, dateTime) => {
  const weights =
    Number.isFinite(weight) && !WEIGHT_CHOICES.includes(weight)
      ? [...WEIGHT_CHOICES, weight].sort((a, b) => a - b)
      : WEIGHT_CHOICES;
  return weights.map((value) => ({
    value,
    label: formatNumber(value, dateTime),
  }));
};

const countActions = (actions) => Object.keys(actions).length;

// An outcome with no actions does nothing, and the line moves on to the next
// line, as after any outcome.
const formatActionsSummary = (actions, copy, dateTime) => {
  const actionCount = countActions(actions);
  return actionCount > 0
    ? formatCommandLineActionCount(actionCount, copy, dateTime)
    : localizeCommandLineText("No actions (move to next line)", copy);
};

// The chance of the outcome being edited, with the draft's weight in place of
// its saved one, or added after the others for a new outcome.
const getTempOutcomeChancePercent = (state) => {
  const weights = state.outcomes.map((outcome) => outcome.weight);
  let index = state.outcomes.findIndex(
    (outcome) => outcome.id === state.currentOutcomeId,
  );
  if (index < 0) {
    index = weights.length;
  }
  weights[index] = state.tempOutcome.weight;
  return getOutcomeChancePercents(weights)[index];
};

export const createInitialState = () => ({
  mode: "current",
  isDistributionSupported: true,
  outcomes: [],
  currentOutcomeId: undefined,
  tempOutcome: createEmptyTempOutcome(),
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    outcomeId: undefined,
  },
});

export const setOutcomes = ({ state }, { outcomes } = {}) => {
  state.outcomes = outcomes;
};

// The Random action uses a distribution the editor cannot edit, so it shows
// a notice and no Submit button.
export const setDistributionUnsupported = ({ state }, _payload = {}) => {
  state.isDistributionSupported = false;
};

// Opens the outcome with this id for editing, or a new outcome when no
// outcome has it.
export const openOutcomeDraft = ({ state }, { outcomeId } = {}) => {
  const outcome = state.outcomes.find((item) => item.id === outcomeId);

  state.mode = "editOutcome";
  state.currentOutcomeId = outcomeId;
  state.tempOutcome = createEmptyTempOutcome();
  if (outcome) {
    state.tempOutcome.weight = outcome.weight;
    state.tempOutcome.actions = outcome.actions;
  }
};

export const closeOutcomeDraft = ({ state }, _payload = {}) => {
  state.mode = "current";
  state.currentOutcomeId = undefined;
  state.tempOutcome = createEmptyTempOutcome();
};

export const setTempOutcomeWeight = ({ state }, { weight } = {}) => {
  state.tempOutcome.weight = weight;
};

export const setTempOutcomeActions = ({ state }, { actions } = {}) => {
  state.tempOutcome.actions = actions;
};

// Saves the draft over the outcome it was opened from, or adds it as a new
// outcome, and goes back to the list.
export const saveOutcomeDraft = ({ state }, _payload = {}) => {
  const outcome = {
    id: state.currentOutcomeId,
    weight: state.tempOutcome.weight,
    actions: state.tempOutcome.actions,
  };
  const index = state.outcomes.findIndex((item) => item.id === outcome.id);

  if (index >= 0) {
    state.outcomes[index] = outcome;
  } else {
    state.outcomes.push(outcome);
  }

  closeOutcomeDraft({ state });
};

export const deleteOutcome = ({ state }, { outcomeId } = {}) => {
  state.outcomes = state.outcomes.filter((outcome) => outcome.id !== outcomeId);
  if (state.currentOutcomeId === outcomeId) {
    closeOutcomeDraft({ state });
  }
};

export const moveOutcome = ({ state }, { outcomeId, direction } = {}) => {
  const index = state.outcomes.findIndex((outcome) => outcome.id === outcomeId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || targetIndex < 0 || targetIndex >= state.outcomes.length) {
    return;
  }

  const outcome = state.outcomes[index];
  state.outcomes[index] = state.outcomes[targetIndex];
  state.outcomes[targetIndex] = outcome;
};

export const showDropdownMenu = ({ state }, { position, outcomeId } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.outcomeId = outcomeId;
  state.dropdownMenu.items = getOutcomeDropdownMenuItems(
    state.outcomes,
    outcomeId,
  );
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.outcomeId = undefined;
};

export const selectOutcomes = ({ state }) => state.outcomes;

export const selectTempOutcome = ({ state }) => state.tempOutcome;

export const selectTempOutcomeActions = ({ state }) =>
  state.tempOutcome.actions;

export const selectDropdownMenuOutcomeId = ({ state }) =>
  state.dropdownMenu.outcomeId;

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const { dateTime } = i18n;
  const chancePercents = getOutcomeChancePercents(
    state.outcomes.map((outcome) => outcome.weight),
  );
  const outcomes = state.outcomes.map((outcome, index) => ({
    id: outcome.id,
    summary: formatCommandLineCopy(
      "Weight {weight} ({chance})",
      {
        weight: formatNumber(outcome.weight, dateTime),
        chance: formatChance(chancePercents[index], dateTime),
      },
      copy,
    ),
    actionsSummary: formatActionsSummary(outcome.actions, copy, dateTime),
  }));

  const breadcrumb = [
    { id: "actions", label: "Actions", click: true },
    { id: "current", label: "Random", click: state.mode !== "current" },
  ];
  if (state.mode === "editOutcome") {
    breadcrumb.push({ label: "Outcome" });
  }

  return {
    mode: state.mode,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    isDistributionSupported: state.isDistributionSupported,
    outcomes,
    tempOutcome: {
      weight: state.tempOutcome.weight,
      chance: formatChance(getTempOutcomeChancePercent(state), dateTime),
    },
    weightOptions: getWeightOptions(state.tempOutcome.weight, dateTime),
    outcomeActions: state.tempOutcome.actions,
    outcomeActionAllowedModes: OUTCOME_ACTION_ALLOWED_MODES,
    hiddenModes: props.hiddenModes ?? [],
    dropdownMenu: localizeCommandLineDropdownMenu(state.dropdownMenu, copy),
    actionsLabel: localizeCommandLineText("Actions", copy),
    addOutcomeButton: localizeCommandLineText("+ Add Outcome", copy),
    chanceLabel: localizeCommandLineText("Chance", copy),
    outcomesLabel: localizeCommandLineText("Outcomes", copy),
    saveOutcomeButton: localizeCommandLineText("Save Outcome", copy),
    submitButton: localizeCommandLineText("Submit", copy),
    unsupportedDistributionLabel: localizeCommandLineText(
      "This random action is saved in a format that RouteVN Creator can't edit.",
      copy,
    ),
    weightLabel: localizeCommandLineText("Weight", copy),
  };
};
