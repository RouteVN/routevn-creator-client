import {
  getProjectImportErrorCode,
  getProjectImportErrorMessage,
} from "../../../internal/projectImportErrors.js";
import { createProjectImportProgressView } from "../../../internal/projectImportProgress.js";
import { isGoogleDriveImportUrl } from "../../../internal/projectImportUrl.js";
import {
  formatProjectsPageCopy,
  selectProjectsPageCopy,
} from "./projectsPageCopy.js";

// Shared tail for every import run: keep a progress dialog visible through
// the import and the list refresh, then toast the imported project. `run`
// receives an `onProgress` callback that turns native download, extraction
// and finishing events into the dialog's status line and progress bar. Failures
// close the progress dialog first and surface a localized alert built from
// the stable native error codes.
export const runProjectImport = async (deps, { run, status }) => {
  const { appService, store, render, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  const progressDialog = appService.showProgressDialog({
    title: copy.importingProjectTitle,
    message: copy.importingProjectMessage,
    status,
    progress: {},
  });
  const onProgress = (event) => {
    progressDialog.update(createProjectImportProgressView({ copy, event }));
  };

  let importedProject;
  try {
    await progressDialog.waitForPaint();
    importedProject = await run({ onProgress });
    const projects = await appService.loadAllProjects();
    store.setProjects({ projects });
    render();
  } catch (error) {
    progressDialog.close();
    if (getProjectImportErrorCode(error) === "projectExists") {
      // Nothing was imported and nothing was changed, so this is not the
      // failure alert: it names the situation and explains what happened.
      appService.showAlert({
        title: copy.importProjectExistsTitle,
        message: createProjectExistsMessage({
          copy,
          platform: appService.getPlatform(),
        }),
      });
      return;
    }
    appService.showAlert({
      message: getProjectImportErrorMessage(error, copy),
    });
    return;
  }
  progressDialog.close();

  appService.showToast({
    message: formatProjectsPageCopy(copy.importedProjectMessage, {
      projectName: importedProject.name,
    }),
  });
};

// What an "already added" alert says. Importing never replaces a project. On
// iOS a project is recognized by the id inside project.db, so the user may be
// holding a different version of the project they already have, and the only
// way to use it is to delete the existing project first. Elsewhere the same
// folder was added twice and there is nothing to replace.
const createProjectExistsMessage = ({ copy, platform }) => {
  const parts = [copy.importProjectExistsExplanation];
  if (platform === "ios") {
    parts.push(copy.importProjectExistsLibraryHint);
  }
  return parts.join("\n\n");
};

const isGoogleDriveFailure = ({ url, error }) => {
  if (!isGoogleDriveImportUrl(url)) {
    return false;
  }
  const code = getProjectImportErrorCode(error);
  // Every platform words an HTTP failure as "HTTP <status>", unlike a network
  // failure, so only a response from Drive (403 quota, 404, a page that is not
  // a zip) earns the sharing hint.
  return (
    code === "invalidArchive" ||
    (code === "downloadFailed" && /\bHTTP \d{3}\b/.test(error.message))
  );
};

// Runs a picker and turns a rejection (for example iOS failing to read the
// chosen file) into the same localized alert as an import failure. A cancelled
// picker, or a failed one, resolves to undefined so callers return early.
const pickOrAlert = async (deps, pick) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  try {
    return await pick();
  } catch (error) {
    appService.showAlert({
      message: getProjectImportErrorMessage(error, copy),
    });
  }
};

// Desktop and mobile folder import: pick a project folder, then register it.
// A cancelled picker returns silently.
export const importProjectFromFolder = async (deps) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  const selectedPath = await pickOrAlert(deps, () =>
    appService.openFolderPicker({
      title: copy.selectExistingProjectFolderTitle,
    }),
  );
  if (!selectedPath) {
    return;
  }

  await runProjectImport(deps, {
    run: () => appService.openExistingProject(selectedPath),
  });
};

// Mobile zip import: pick a local zip archive, then import it into app
// storage. A cancelled picker returns silently.
export const importProjectFromZip = async (deps) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  const archive = await pickOrAlert(deps, () =>
    appService.openArchivePicker({
      title: copy.selectProjectArchiveTitle,
    }),
  );
  if (!archive?.uri) {
    return;
  }

  await runProjectImport(deps, {
    status: copy.importPreparingStatus,
    run: ({ onProgress }) =>
      appService.importProjectFromArchive({ uri: archive.uri, onProgress }),
  });
};

// "From local": desktop opens the folder picker. Android and iOS have no
// single system picker for a folder or a zip file, so they first ask which one
// with the same vertical-button source dialog the media pickers use. Dismissing
// the dialog returns silently.
export const importProjectFromLocal = async (deps) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);
  const platform = appService.getPlatform();

  if (platform !== "android" && platform !== "ios") {
    await importProjectFromFolder(deps);
    return;
  }

  const result = await appService.showFormDialog({
    size: "sm",
    form: {
      title: copy.importFromLocalTitle,
      fields: [],
      actions: {
        layout: "vertical",
        buttons: [
          {
            id: "import-folder",
            label: copy.importLocalFolderButton,
            variant: "se",
          },
          {
            id: "import-zip",
            label: copy.importLocalZipButton,
            variant: "se",
          },
        ],
      },
    },
  });

  if (result?.actionId === "import-folder") {
    await importProjectFromFolder(deps);
    return;
  }

  if (result?.actionId === "import-zip") {
    await importProjectFromZip(deps);
  }
};

// URL import: desktop asks for a destination parent folder first (a cancelled
// pick returns silently); mobile imports straight into app storage.
export const importProjectFromUrl = async (deps, { url }) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  let destinationFolder;
  if (appService.getPlatform() === "tauri") {
    destinationFolder = await pickOrAlert(deps, () =>
      appService.openFolderPicker({
        title: copy.selectImportDestinationTitle,
      }),
    );
    if (!destinationFolder) {
      return;
    }
  }

  await runProjectImport(deps, {
    status: copy.importConnectingStatus,
    run: async ({ onProgress }) => {
      try {
        return await appService.importProjectFromUrl({
          url,
          destinationFolder,
          onProgress,
        });
      } catch (error) {
        // Drive answers with a web page instead of the file when it is private
        // or past its download limit, so say what to check. A download that
        // never reached Drive (offline, timeout) keeps its own message.
        if (isGoogleDriveFailure({ url, error })) {
          throw new Error(`googleDriveFailed: ${error.message}`);
        }
        throw error;
      }
    },
  });
};
