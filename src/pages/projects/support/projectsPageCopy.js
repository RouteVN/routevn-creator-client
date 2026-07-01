export const PROJECTS_PAGE_COPY = Object.freeze({
  addMemberMenuItem: "Add Member",
  addMemberTitle: "Add Member",
  addMemberTitleWithProject: "Add Member - {projectName}",
  alreadyMember: "User is already a member.",
  avatarLabel: "Avatar",
  cancelButton: "Cancel",
  cannotAddOwner: "Project owner cannot be added as a member.",
  checkUpdateMenuItem: "Check for update",
  cloudDescription:
    "Cloud projects are the projects stored in your RouteVN account.",
  cloudEmptyDescription: "Create your first cloud project.",
  cloudEmptyTitle: "No cloud projects yet",
  cloudLoginDescription:
    "Authenticate to load projects from your RouteVN account.",
  cloudLoginTitle: "Login to see your cloud projects",
  cloudProjectMissing: "Cloud project is missing.",
  cloudTitle: "Cloud Projects",
  createButton: "Create",
  createCloudButton: "Create Cloud Project",
  createCloudProjectTitle: "Create Cloud Project",
  createProjectDialogNotReady: "Create project dialog is not ready.",
  createProjectMenuItem: "Create Project",
  descriptionLabel: "Description",
  displayColorLabel: "Display Color",
  displayNameLabel: "Display Name",
  editProfileMenuItem: "Edit profile",
  editProfileTitle: "Edit Profile",
  emailLabel: "Email",
  emailRequiredAlert: "Email is required.",
  failedAddMember: "Failed to add member. Please try again.",
  failedCreateCloudProject: "Failed to create cloud project. Please try again.",
  failedCreateProject:
    "Failed to create project. Please check the selected folder and try again.",
  failedImportProject:
    "Failed to import project. Please select a valid project folder.",
  failedLoadCloudProjects:
    "Failed to load cloud projects. Please try again later.",
  failedRemoveProject: "Failed to remove project. Please try again.",
  failedChangeLanguage: "Failed to change language. Please try again.",
  fillRequiredFields: "Please fill in all required fields.",
  importButton: "Import",
  importedProjectMessage: 'Project "{projectName}" imported.',
  importProjectMenuItem: "Import Project",
  incompatibleProjectTitle: "Incompatible Project",
  invalidProjectEntryImportAgain:
    "This project entry is invalid. Remove it from the list and import the project again.",
  invalidProjectEntryRefresh:
    "This project entry is invalid. Refresh the projects page and try again.",
  languageLabel: "Language",
  languageMenuItem: "Language",
  languageTitle: "Language",
  localEmptyDescription: "Create or open a local project to get started",
  localEmptyTitle: "No local projects yet",
  loginButton: "Login",
  loginToAddMember: "Please login to add a member.",
  loginToCreateCloudProject: "Please login to create a cloud project.",
  logoutConfirm: "Logout",
  logoutMenuItem: "Logout",
  logoutMessage: "Are you sure you want to logout?",
  logoutTitle: "Logout",
  memberAdded: "Member added.",
  membersLabel: "Members",
  noMemberAdded: "No member was added.",
  notLoggedIn: "You are not logged in.",
  optionalLabel: "Optional",
  profileDefaultName: "User",
  projectLocationRequiredAlert: "Project Location is required.",
  projectNameLabel: "Project Name",
  projectNameRequiredAlert: "Project Name is required.",
  projectNameRequiredMessage: "Project name is required",
  projectResolutionInvalid: "Project Resolution is invalid.",
  removeButton: "Remove",
  removeProjectMessage:
    "Are you sure you want to remove {projectName} from the list? The project folder will still remain on disk. Delete the folder yourself if you want to permanently remove the project files.",
  removeProjectTargetFallback: "this project",
  removeProjectTitle: "Remove Project",
  resolutionHeightRequired: "Resolution Height is required.",
  resolutionInvalidDimensions:
    "Resolution Width and Height must be positive integers.",
  resolutionWidthRequired: "Resolution Width is required.",
  roleMember: "Member",
  roleOwner: "Owner",
  saveButton: "Save",
  selectExistingProjectFolderTitle: "Select Existing Project Folder",
  settingsMenuItem: "Settings",
  settingsTitle: "Settings",
  submitButton: "Submit",
  title: "Projects",
  untitledProject: "Untitled",
  userNotFound: "User not found.",
  validEmailMessage: "Please enter a valid email address",
});

export const selectProjectsPageCopy = (i18n = {}) => ({
  ...PROJECTS_PAGE_COPY,
  ...(i18n.projectsPage ?? {}),
});

export const hasProjectsPageI18n = (i18n = {}) => {
  return Boolean(i18n.projectsPage);
};

export const formatProjectsPageCopy = (template, replacements = {}) => {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value ?? "");
  });
  return text;
};
