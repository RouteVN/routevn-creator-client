import { validateIconDimensions } from "../../infra/web/fileProcessors.js";

const FILE_VALIDATION_ERROR_TITLE = "Error";

const runFileValidation = async ({ file, validation } = {}) => {
  if (!file || !validation || typeof validation !== "object") {
    return { isValid: true, message: undefined };
  }

  if (validation.type === "square") {
    return validateIconDimensions(file);
  }

  return { isValid: true, message: undefined };
};

const validatePickedFiles = async ({ files, validations } = {}) => {
  const fileList = Array.isArray(files) ? files : [];
  const validationList = Array.isArray(validations) ? validations : [];

  for (const file of fileList) {
    for (const validation of validationList) {
      const result = await runFileValidation({ file, validation });
      if (!result?.isValid) {
        return {
          isValid: false,
          message: result?.message ?? "Invalid file selected.",
        };
      }
    }
  }

  return { isValid: true, message: undefined };
};

const attachUploadState = ({ file, uploadResult } = {}) => {
  if (!file) {
    return file;
  }

  const isSuccessful = Boolean(uploadResult);
  try {
    file.uploadSucessful = isSuccessful;
    file.uploadSuccessful = isSuccessful;
    file.uploadResult = uploadResult ?? null;
  } catch {
    // Ignore if File object cannot be extended in this runtime.
  }

  return file;
};

export const createFileSelectionService = ({
  globalUI,
  filePicker,
  projectService,
  platformAdapter,
}) => {
  return {
    async pickFiles(options = {}) {
      const multiple = options.multiple ?? false;
      const upload = options.upload ?? false;
      const validations = Array.isArray(options.validations)
        ? options.validations
        : [];

      const selection = await platformAdapter.selectFiles({
        options,
        multiple,
        filePicker,
      });

      const files = Array.isArray(selection)
        ? selection
        : selection
          ? [selection]
          : [];

      if (files.length === 0) {
        return multiple ? [] : null;
      }

      const filesToValidate = multiple ? files : files.slice(0, 1);
      const validationResult = await validatePickedFiles({
        files: filesToValidate,
        validations,
      });

      if (!validationResult.isValid) {
        globalUI.showAlert({
          message: validationResult.message,
          title: FILE_VALIDATION_ERROR_TITLE,
        });
        return multiple ? [] : null;
      }

      if (!upload) {
        return multiple ? files : files[0] || null;
      }

      const uploadResults = await projectService.uploadFiles(filesToValidate);
      if (multiple) {
        return files.map((file) => {
          const uploadResult =
            uploadResults.find((item) => item.file === file) || null;
          return attachUploadState({ file, uploadResult });
        });
      }

      const file = files[0] || null;
      const uploadResult =
        uploadResults.find((item) => item.file === file) ||
        uploadResults[0] ||
        null;
      return attachUploadState({ file, uploadResult });
    },
  };
};
