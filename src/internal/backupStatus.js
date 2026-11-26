// Backup problems that stop every project until the user picks a folder again.
export const BACKUP_FOLDER_ERRORS = new Set([
  "reconnect",
  "unknownSpace",
  "localFolder",
  "appFolder",
  "nameConflict",
  "invalidBackup",
]);

// Native code retries every failure by itself. A save in progress, files
// changing mid-copy, or an interrupted copy clear up within seconds.
const SHORT_WAIT_ERRORS = new Set(["busy", "changed", "interrupted"]);
// Native code retries a short wait five times, three seconds apart, before it
// waits longer; only then is it worth showing.
const SHORT_WAIT_SHOWN_AFTER = 6;
const ACTION_ERRORS = new Set([...BACKUP_FOLDER_ERRORS, "lowSpace"]);
const REPEATED_FAILURES = 3;

// A folder problem first, since it stops every project, then low space.
const pickProblem = (projects) => {
  const project =
    projects.find((entry) => BACKUP_FOLDER_ERRORS.has(entry.error)) ??
    projects.find((entry) => entry.error === "lowSpace") ??
    projects[0];
  if (!project) return undefined;
  return {
    projectId: project.id,
    name: project.name,
    error: project.error,
    folderProblem: BACKUP_FOLDER_ERRORS.has(project.error),
  };
};

/**
 * The backup error to show on screen: any lasting error, including one saved
 * by an earlier run of the app, and a short wait only once it keeps coming back.
 * @param {object[]} projects - Projects from the native backup status
 * @returns {{ projectId: string, name: string, error: string, folderProblem: boolean } | undefined}
 */
export const findShownBackupError = (projects) =>
  pickProblem(
    projects.filter(
      (project) =>
        project.error &&
        (!SHORT_WAIT_ERRORS.has(project.error) ||
          (project.failures ?? 0) >= SHORT_WAIT_SHOWN_AFTER),
    ),
  );

/**
 * The backup problem worth a dialog: one this run of the app ran into that
 * needs the user, or another failure that keeps repeating. Short waits and
 * errors saved by an earlier run never open one.
 * @param {object} status - Native backup status
 * @returns {{ projectId: string, name: string, error: string, folderProblem: boolean } | undefined}
 */
export const findBackupProblem = (status) => {
  if (!status.configured) return undefined;
  return pickProblem(
    status.projects.filter(
      (project) =>
        project.error &&
        !SHORT_WAIT_ERRORS.has(project.error) &&
        (project.failures ?? 0) >=
          (ACTION_ERRORS.has(project.error) ? 1 : REPEATED_FAILURES),
    ),
  );
};

/**
 * The most recent successful backup across projects, as an ISO string.
 * @param {object[]} projects - Projects from the native backup status
 * @returns {string | undefined}
 */
export const findLatestBackup = (projects) =>
  projects
    .map((project) => project.snapshotAt)
    .filter(Boolean)
    .sort()
    .at(-1);
