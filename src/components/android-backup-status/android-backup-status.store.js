import { formatDateTimeWithSeconds } from "../../internal/dates.js";

export const createInitialState = () => ({
  status: { configured: false, projects: [] },
  currentProjectId: undefined,
});
export const setStatus = ({ state }, { status, currentProjectId }) => {
  state.status = status;
  state.currentProjectId = currentProjectId;
};
export const selectViewData = ({ state, props, i18n }) => {
  const copy = i18n.androidBackup;
  const { status } = state;
  const error =
    status.error ?? status.projects.find((project) => project.error)?.error;
  const message = !status.configured
    ? copy.notConfigured
    : error
      ? (i18n.androidBackupErrors[error] ?? i18n.androidBackupErrors.failed)
      : props.settings
        ? ""
        : copy.configuredDescription;
  const folder = props.settings
    ? (status.projects.find((project) => project.id === state.currentProjectId)
        ?.backupFolderPath ?? "")
    : (status.folder?.displayPath ?? "");
  return {
    copy,
    title: !status.configured
      ? copy.notConfiguredTitle
      : error
        ? copy.title
        : copy.configuredTitle,
    showWarning: !status.configured || Boolean(error),
    visible: !status.loading,
    settings: props.settings,
    configured: status.configured,
    busy: status.running,
    message,
    folder,
    folderName: folder ? `…/${folder.split("/").slice(-2).join("/")}` : "",
    setupLabel: status.configured ? copy.changeFolder : copy.setupFolder,
    projects: status.projects
      .filter(
        (project) => props.settings && project.id === state.currentProjectId,
      )
      .map((project) => ({
        id: project.id,
        date: project.snapshotAt
          ? formatDateTimeWithSeconds(project.snapshotAt, i18n.dateTime)
          : copy.never,
      })),
  };
};
