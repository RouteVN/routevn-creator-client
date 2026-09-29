import { formatI18nCopy } from "./i18nCopy.js";

// A selection is one batch, even when the caller stores its files serially.
export const filterImageUploadFiles = async (deps, files) => {
  const { projectService, appService, i18n } = deps;
  const copy = i18n.imageUploadValidation;
  let result;
  try {
    result = await projectService.validateImageUploadFiles(files);
  } catch (error) {
    console.error("Image upload validation failed", error);
    appService.showAlert({ title: copy.title, message: copy.checkFailed });
    return [];
  }
  if (result.rejected.length > 0) {
    const fileNames = result.rejected.map(({ file, width, height }) =>
      formatI18nCopy(copy.file, { name: file.name, width, height }),
    );
    appService.showAlert({
      title: copy.title,
      message: formatI18nCopy(copy.rejected, {
        limit: result.limit,
        files: fileNames.map((name) => `• ${name}`).join("\n"),
      }),
    });
  }
  return result.files;
};
