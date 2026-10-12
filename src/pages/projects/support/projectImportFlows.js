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
// holding a different version of the project they already have. Remove only
// hides a project, and importing it again restores the library's own copy, so
// the only way to use the incoming one is to delete the project's folder in
// the Files app first. Elsewhere it only means a different project was found
// at a path that is already listed, and there is nothing to replace.
const createProjectExistsMessage = ({ copy, platform }) => {
  const parts = [copy.importProjectExistsExplanation];
  if (platform === "ios") {
    parts.push(copy.importProjectExistsLibraryHint);
  }
  return parts.join("\n\n");
};

// Tauri's invoke rejects with a plain string, not an Error, so the native
// "<code>: <detail>" text is the error itself on desktop.
const getErrorDetail = (error) =>
  typeof error?.message === "string" ? error.message : String(error);

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
    (code === "downloadFailed" && /\bHTTP \d{3}\b/.test(getErrorDetail(error)))
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

// Picks a local zip archive: `{ uri, name }`, or undefined when cancelled or
// failed.
export const pickProjectArchive = (deps) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  return pickOrAlert(deps, () =>
    appService.openArchivePicker({
      title: copy.selectProjectArchiveTitle,
    }),
  );
};

// Picks the folder a desktop zip or URL import is saved in, or undefined when
// cancelled or failed.
export const pickImportDestinationFolder = (deps) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  return pickOrAlert(deps, () =>
    appService.openFolderPicker({
      title: copy.selectImportDestinationTitle,
    }),
  );
};

// The dialog error for a desktop zip or URL import's destination folder, or
// undefined when it can be used. As for a new project, the folder must be
// empty: the project is saved directly in it. A folder that cannot be read is
// left to the import, which fails with the error's details.
export const getImportDestinationError = async (deps, folder) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  if (!folder) {
    return copy.importDestinationRequiredMessage;
  }
  try {
    if (!(await appService.isFolderEmpty(folder))) {
      return copy.importDestinationNotEmptyMessage;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

// Zip import: desktop imports into the empty folder chosen in the zip dialog;
// mobile passes no destination and imports into app storage.
export const importProjectArchive = async (
  deps,
  { archive, destinationFolder },
) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

  await runProjectImport(deps, {
    status: copy.importPreparingStatus,
    run: ({ onProgress }) =>
      appService.importProjectFromArchive({
        uri: archive.uri,
        destinationFolder,
        onProgress,
      }),
  });
};

// Mobile zip import: pick a local zip archive, then import it into app
// storage. A cancelled picker returns silently.
export const importProjectFromZip = async (deps) => {
  const archive = await pickProjectArchive(deps);
  if (!archive?.uri) {
    return;
  }

  await importProjectArchive(deps, { archive });
};

// "From local" on Android and iOS: there is no single system picker for a
// folder or a zip file, so it first asks which one with the same
// vertical-button source dialog the media pickers use. Dismissing the dialog
// returns silently. Desktop lists folder and zip import as separate menu items.
export const importProjectFromLocal = async (deps) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

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

// URL import: desktop imports into the empty folder chosen in the URL dialog;
// mobile passes no destination and imports straight into app storage.
export const importProjectFromUrl = async (
  deps,
  { url, destinationFolder },
) => {
  const { appService, i18n } = deps;
  const copy = selectProjectsPageCopy(i18n);

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
          throw new Error(`googleDriveFailed: ${getErrorDetail(error)}`);
        }
        throw error;
      }
    },
  });
};
