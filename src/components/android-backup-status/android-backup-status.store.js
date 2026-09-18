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
    visible: true,
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
          ? formatBackupDate(project.snapshotAt)
          : copy.never,
      })),
  };
};
const formatBackupDate = (value) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second}`;
};
