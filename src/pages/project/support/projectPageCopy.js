export const PROJECT_PAGE_COPY = Object.freeze({
  backToProjects: "Back to Projects",
  clickToUpload: "Click to upload",
  cloudProject: "Cloud Project",
  descriptionLabel: "Description",
  editProjectTitle: "Edit Project",
  errorTitle: "Error",
  exportCompleteTitle: "Export Complete",
  exportedProjectMessage: 'Project exported to "{projectName}".',
  exportingProject: "Exporting project...",
  exportProject: "Export project",
  failedCropProjectIcon: "Failed to crop project icon.",
  failedExportProject: "Failed to export project.",
  failedSelectExportFolder: "Failed to select an export folder.",
  failedSelectProjectIcon: "Failed to select project icon.",
  failedUploadProjectIcon: "Failed to upload project icon.",
  noLocalProjectOpen: "No local project is currently open.",
  projectIconCropNotReady: "Project icon crop is not ready.",
  projectIconLabel: "Project Icon",
  projectNameLabel: "Project Name",
  projectNameRequired: "Project name is required.",
  projectResolutionLabel: "Project resolution",
  resolutionLabel: "Resolution",
  saveChangesButton: "Save Changes",
  selectExportFolderTitle: "Select Export Folder",
  warningTitle: "Warning",
});

export const selectProjectPageCopy = (i18n = {}) => ({
  ...PROJECT_PAGE_COPY,
  ...(i18n.projectPage ?? {}),
});

export const formatProjectPageCopy = (template, replacements = {}) => {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value ?? "");
  });
  return text;
};
