import { selectEditHistoryCopy } from "../../internal/ui/editHistory.js";
import { selectI18nCopy } from "../../internal/ui/i18nCopy.js";

const selectCopy = (i18n) => selectI18nCopy(i18n, ["spritesheetEditorPage"]);

export const createInitialState = () => ({
  target: undefined,
  spritesheetName: "",
  canUndo: false,
  canRedo: false,
  discardChanges: false,
});

export const setTarget = ({ state }, { target, spritesheetName } = {}) => {
  state.target = target;
  state.spritesheetName = spritesheetName ?? "";
  state.canUndo = false;
  state.canRedo = false;
};

export const setEditHistoryState = ({ state }, { canUndo, canRedo } = {}) => {
  state.canUndo = canUndo === true;
  state.canRedo = canRedo === true;
};

// The user chose to leave without the changes that could not be saved.
export const discardChanges = ({ state }) => {
  state.discardChanges = true;
};

export const selectTarget = ({ state }) => state.target;

export const selectShouldDiscardChanges = ({ state }) => state.discardChanges;

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCopy(i18n);
  const editHistoryCopy = selectEditHistoryCopy(i18n);

  return {
    spritesheetName: state.spritesheetName,
    backLabel: copy.backButton,
    undoDisabled: !state.canUndo,
    redoDisabled: !state.canRedo,
    undoLabel: editHistoryCopy.undoLabel,
    redoLabel: editHistoryCopy.redoLabel,
  };
};
