import { withErrorDetails } from "../errorDetails.js";
import { formatNumber } from "../dates.js";
import { formatFileSize } from "../files.js";
import {
  PROJECT_TEMPLATE_FILE_TOO_LARGE,
  PROJECT_TEMPLATE_FILES_TOO_LARGE,
  PROJECT_TEMPLATE_LIMITS,
  PROJECT_TEMPLATE_STATE_TOO_LARGE,
  PROJECT_TEMPLATE_TOO_MANY_FILES,
  PROJECT_TEMPLATE_UNSUPPORTED_FILE,
  PROJECT_TEMPLATE_UNSUPPORTED_FILE_ID,
  PROJECT_TEMPLATE_UNSUPPORTED_RESOLUTION,
  ProjectTemplateExportError,
} from "../projectTemplatePackage.js";
import { formatI18nCopy } from "./i18nCopy.js";

// The project's name, as a file name.
const toZipFileName = (name) =>
  `${(name ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-") || "project-template"}.zip`;

const toPercent = (current, total) =>
  total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : 100;

// Why a project cannot be a template, in the words of its projectPage copy.
const getRefusalMessage = (error, { copy, dateTime }) => {
  const size = (bytes) => formatFileSize(bytes, dateTime);
  switch (error.code) {
    case PROJECT_TEMPLATE_TOO_MANY_FILES:
      return formatI18nCopy(copy.templateTooManyFilesMessage, {
        limit: formatNumber(PROJECT_TEMPLATE_LIMITS.files, dateTime),
      });
    case PROJECT_TEMPLATE_FILE_TOO_LARGE:
      return formatI18nCopy(copy.templateFileTooLargeMessage, {
        limit: size(PROJECT_TEMPLATE_LIMITS.fileBytes),
      });
    case PROJECT_TEMPLATE_FILES_TOO_LARGE:
      return formatI18nCopy(copy.templateFilesTooLargeMessage, {
        limit: size(PROJECT_TEMPLATE_LIMITS.totalBytes),
      });
    case PROJECT_TEMPLATE_STATE_TOO_LARGE:
      return formatI18nCopy(copy.templateStateTooLargeMessage, {
        limit: size(PROJECT_TEMPLATE_LIMITS.manifestBytes),
      });
    case PROJECT_TEMPLATE_UNSUPPORTED_FILE:
      return formatI18nCopy(copy.templateUnsupportedFileMessage, {
        mimeType: error.details.mimeType ?? "",
      });
    case PROJECT_TEMPLATE_UNSUPPORTED_RESOLUTION:
      return copy.templateUnsupportedResolutionMessage;
    default:
      return undefined;
  }
};

// A refusal says what to change; a file ID names no file the user knows, so
// its details say which it is.
const showFailure = (appService, error, { copy, dateTime }) => {
  let message;
  if (error?.code === PROJECT_TEMPLATE_UNSUPPORTED_FILE_ID) {
    message = withErrorDetails(
      copy.templateUnsupportedFileIdMessage,
      error,
      copy.errorDetailsLabel,
    );
  } else if (error instanceof ProjectTemplateExportError) {
    message = getRefusalMessage(error, { copy, dateTime });
  }
  appService.showAlert({
    title: copy.errorTitle,
    message:
      message ??
      withErrorDetails(
        copy.failedExportTemplate,
        error,
        copy.errorDetailsLabel,
      ),
  });
};

/**
 * Exports the open project as a template file: its current state and the
 * files it uses, without its history. A project a template cannot hold is
 * refused before anything is asked; otherwise it asks where to save the ZIP,
 * writes it and says where it went. `name` and `description` are the
 * project's, which name the template.
 */
export const exportProjectTemplate = async ({
  appService,
  projectService,
  i18n,
  name,
  description,
}) => {
  const copy = i18n.projectPage;
  const dateTime = i18n.dateTime;
  let repository;
  try {
    ({ repository } = await projectService.prepareProjectTemplate({
      name,
      description,
    }));
  } catch (error) {
    showFailure(appService, error, { copy, dateTime });
    return;
  }

  let outputPath;
  try {
    outputPath = await appService.saveFilePicker({
      title: copy.saveTemplateTitle,
      defaultPath: toZipFileName(name),
      filters: [{ name: copy.zipFileTypeName, extensions: ["zip"] }],
    });
  } catch (error) {
    console.error("[project-template] Failed to choose an export path.", error);
    appService.showToast({
      message: copy.failedSelectTemplatePath,
      status: "error",
    });
    return;
  }
  if (!outputPath) return;

  const progressDialog = appService.showProgressDialog({
    title: copy.exportingTemplateTitle,
    message: copy.exportingTemplateMessage,
    status: copy.exportingTemplatePreparingStatus,
    progress: {},
  });
  try {
    await progressDialog.waitForPaint();
    const bundle = await projectService.createProjectTemplateBundle({
      repository,
      name,
      description,
      onProgress: ({ current, total }) =>
        progressDialog.update({
          status: formatI18nCopy(copy.exportingTemplateReadingStatus, {
            percent: String(toPercent(current, total)),
          }),
          progress: total > 0 ? { current, total } : {},
        }),
    });
    progressDialog.update({
      status: copy.exportingTemplateSavingStatus,
      progress: {},
    });
    const savedPath = await appService.writeFile(outputPath, bundle);
    progressDialog.close();
    appService.showAlert({
      title: copy.exportCompleteTitle,
      message: formatI18nCopy(copy.templateExportedMessage, {
        path: savedPath ?? outputPath,
      }),
    });
  } catch (error) {
    progressDialog.close();
    console.error("[project-template] Failed to export the template.", error);
    showFailure(appService, error, { copy, dateTime });
  }
};
