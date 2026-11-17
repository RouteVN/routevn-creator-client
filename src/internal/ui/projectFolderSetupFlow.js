import { selectOnMyDeviceLocation } from "../iosFilesLocation.js";
import { formatI18nCopy } from "./i18nCopy.js";

const LOCATION_KEYS = [
  "description",
  "openDescription",
  "appFolderError",
  "localFolderError",
];

const errorKeys = {
  unavailable: "unavailableError",
  appFolder: "appFolderError",
  localFolder: "localFolderError",
  notDirectory: "invalidFolderError",
  nameConflict: "nameConflictError",
};

// iOS projects folder copy with the Files location, such as "On My iPad",
// filled in for the device.
export const selectProjectFolderSetupCopy = (i18n, deviceName = "iPhone") => {
  const copy = { ...i18n.projectFolderSetupPage };
  const location = selectOnMyDeviceLocation(i18n.appPage, deviceName);
  for (const key of LOCATION_KEYS) {
    copy[key] = formatI18nCopy(copy[key], { location });
  }
  return copy;
};

// On iOS every project lives in one folder that the user chooses in Files.
// Explains that in a dialog, opens the folder picker and saves the choice.
// The dialog covers a first setup, a saved folder that can no longer be
// opened, and changing a saved folder. Resolves to the saved folder status,
// or to no value when the user cancels or the folder is rejected.
export const chooseProjectFolder = async ({ appService, i18n }) => {
  const status = appService.getProjectFolderSetup();
  const copy = selectProjectFolderSetupCopy(i18n, status.deviceName);
  const showError = (errorKey) => {
    appService.showToast({
      title: copy.errorTitle,
      message: copy[errorKey],
      status: "error",
    });
  };
  if (status.reason === "unavailable") {
    showError("unavailableError");
    return undefined;
  }

  let title = copy.title;
  let message = `${copy.allProjectsDescription} ${copy.description}`;
  if (status.configured) {
    title = copy.changeFolder;
  } else if (status.reason === "reconnect") {
    message = `${copy.reconnectError} ${copy.openDescription}`;
  }
  // One button only: tapping outside the dialog dismisses it.
  const result = await appService.showFormDialog({
    size: "sm",
    form: {
      title,
      description: message,
      fields: [],
      actions: {
        buttons: [{ id: "choose", label: copy.chooseFolder, variant: "pr" }],
      },
    },
  });
  if (result?.actionId !== "choose") return undefined;

  let candidate;
  try {
    candidate = await appService.pickProjectFolderSetup({
      title: copy.pickerTitle,
    });
  } catch (error) {
    showError(errorKeys[error.code] ?? "pickError");
    return undefined;
  }
  if (!candidate) return undefined;

  try {
    return await appService.confirmProjectFolderSetup({ uri: candidate.uri });
  } catch (error) {
    showError(errorKeys[error.code] ?? "confirmError");
    return undefined;
  }
};
