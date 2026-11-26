import {
  formatDate,
  formatDateTimeWithSeconds,
  formatNumber,
} from "../../internal/dates.js";
import {
  findLatestBackup,
  findShownBackupError,
} from "../../internal/backupStatus.js";

export const createInitialState = () => ({
  status: { configured: false, projects: [], loading: true },
  currentProjectId: undefined,
  starting: false,
});
export const setStatus = ({ state }, { status, currentProjectId }) => {
  state.status = status;
  state.currentProjectId = currentProjectId;
};
export const setStarting = ({ state }, { starting }) => {
  state.starting = starting;
};
export const selectCurrentProjectId = ({ state }) => state.currentProjectId;
export const selectIsStarting = ({ state }) => state.starting;

const TONE_ICONS = {
  ok: { icon: "backup-check", iconColor: "#22c55e" },
  warning: { icon: "warning-dead-end", iconColor: "#f59e0b" },
  running: { icon: "upload", iconColor: "var(--muted-foreground)" },
};

const formatFolderName = (folder) =>
  folder ? `…/${folder.split("/").slice(-2).join("/")}` : "";

const selectProgress = ({ status, copy, dateTime, projectId }) => {
  const { progress } = status;
  // Before media copying starts, the pass is still choosing what to back up.
  if (
    !status.running ||
    !progress ||
    (projectId && progress.projectId !== projectId)
  ) {
    return {
      running: Boolean(status.running) && !projectId,
      files: "",
    };
  }
  return {
    running: true,
    project: copy.backingUp.replace("{name}", () => progress.name),
    files:
      progress.total > 0
        ? copy.copyingFiles
            .replace("{done}", () => formatNumber(progress.done, dateTime))
            .replace("{total}", () => formatNumber(progress.total, dateTime))
        : "",
  };
};

// The Projects page card covers every project.
const selectCardData = ({ state, i18n }) => {
  const copy = i18n.androidBackup;
  const { status } = state;
  const problem = findShownBackupError(status.projects);
  const progress = selectProgress({ status, copy, dateTime: i18n.dateTime });
  const latest = findLatestBackup(status.projects);
  const folder = status.folder?.displayPath ?? "";
  let tone = "ok";
  let title = copy.configuredTitle;
  let message = copy.configuredDescription;
  if (problem) {
    tone = "warning";
    title = copy.attentionTitle;
    message =
      i18n.androidBackupErrors[problem.error] ??
      i18n.androidBackupErrors.failed;
  } else if (progress.running) {
    tone = "running";
    title = copy.running;
    message = progress.project ?? copy.preparing;
  } else if (latest) {
    message = copy.lastBackupAt.replace("{time}", () =>
      formatDate(latest, i18n.dateTime),
    );
  } else if (status.projects.length > 0) {
    message = copy.notBackedUpYet;
  }
  return {
    tone,
    title,
    message,
    detail: progress.running && !problem ? progress.files : "",
    problemProject: problem && !problem.folderProblem ? problem.name : "",
    someNotBackedUp:
      !problem &&
      Boolean(latest) &&
      status.projects.some((project) => !project.snapshotAt),
    folder,
    folderName: formatFolderName(folder),
    chooseFolderAgain: Boolean(problem?.folderProblem),
    tryAgain: Boolean(problem) && !problem.folderProblem,
  };
};

// The Config page section covers the open project.
const selectSettingsData = ({ state, i18n }) => {
  const copy = i18n.androidBackup;
  const { status, currentProjectId } = state;
  const project = status.projects.find(
    (entry) => entry.id === currentProjectId,
  );
  const projects = project ? [project] : [];
  const problem = findShownBackupError(projects);
  const progress = selectProgress({
    status,
    copy,
    dateTime: i18n.dateTime,
    projectId: currentProjectId,
  });
  const folder = project?.backupFolderPath ?? "";
  let message = "";
  if (problem) {
    message =
      i18n.androidBackupErrors[problem.error] ??
      i18n.androidBackupErrors.failed;
  } else if (progress.running) {
    message = copy.running;
  } else if (project?.pending) {
    message = copy.waiting;
  }
  return {
    tone: problem ? "warning" : progress.running ? "running" : "ok",
    message,
    detail: progress.running && !problem ? progress.files : "",
    lastBackup: copy.lastBackupAt.replace("{time}", () =>
      project?.snapshotAt
        ? formatDateTimeWithSeconds(project.snapshotAt, i18n.dateTime)
        : copy.never,
    ),
    showProject: Boolean(project),
    folder,
    folderName: formatFolderName(folder),
    chooseFolderAgain: Boolean(problem?.folderProblem),
  };
};

export const selectViewData = ({ state, props, i18n }) => {
  const { status } = state;
  const data = props.settings
    ? selectSettingsData({ state, i18n })
    : selectCardData({ state, i18n });
  return {
    ...data,
    ...TONE_ICONS[data.tone],
    copy: i18n.androidBackup,
    visible: !status.loading,
    settings: props.settings,
    configured: status.configured,
    backUpDisabled: status.running || state.starting,
    notConfiguredTitle: i18n.androidBackup.notConfiguredTitle,
  };
};
