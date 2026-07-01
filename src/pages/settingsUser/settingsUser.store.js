import { selectSettingsUserPageCopy } from "./support/settingsUserPageCopy.js";

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "user",
  repositoryTarget: "settings",
  flatItems: [],
});

export const selectViewData = ({ state, i18n }) => {
  const copy = selectSettingsUserPageCopy(i18n);

  return {
    ...state,
    placeholderMessage:
      copy.placeholderMessage ?? "User settings content will go here",
    placeholderNote:
      copy.placeholderNote ??
      "This is a placeholder for the user settings interface",
    title: copy.title ?? "User Settings",
  };
};

export const selectState = ({ state }) => {
  return state;
};
