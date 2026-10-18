export const PROJECT_STORAGE_NOT_EMPTY_MESSAGE =
  "Project storage is not empty. New project initialization requires empty storage.";

const PROJECT_FOLDER_NOT_EMPTY_CODE = "project_folder_not_empty";

// The folder chosen for a new desktop project already contains files. The
// projects page shows its own localized message for this code.
export const createProjectFolderNotEmptyError = () => {
  const error = new Error(
    "The selected folder must be empty. Please choose an empty folder for your new project.",
  );
  error.code = PROJECT_FOLDER_NOT_EMPTY_CODE;
  return error;
};

export const isProjectFolderNotEmptyError = (error) =>
  error?.code === PROJECT_FOLDER_NOT_EMPTY_CODE;
