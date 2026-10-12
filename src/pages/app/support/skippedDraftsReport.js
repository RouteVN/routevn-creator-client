import { EMPTY, Observable, catchError, switchMap, tap } from "rxjs";

// Local drafts that no longer apply when a project's history loads are left
// out of the project but kept in storage. Each one is reported once and not
// shown to the user: such a draft can be left out long after it was made, when
// the user no longer remembers the change. A change that fails to save while
// the user makes it is shown by the editor that saves it.

// The key keeps the name it had when left-out drafts were also shown to the
// user, so that drafts reported then are not reported again.
export const getReportedSkippedDraftsConfigKey = (projectId) =>
  `projectHistory.notifiedSkippedDrafts.${projectId}`;

// The left-out drafts as one error for the report. Each failure is listed once
// with its count, since the reporter keeps only the start of the message.
const createSkippedDraftsError = (skippedDrafts) => {
  const failureCounts = new Map();
  for (const { type, error: draftError } of skippedDrafts) {
    const failure = `${type}: ${draftError.message}`;
    failureCounts.set(failure, (failureCounts.get(failure) ?? 0) + 1);
  }
  const error = new Error(
    [...failureCounts]
      .map(([failure, count]) =>
        count > 1 ? `${failure} (×${count})` : failure,
      )
      .join("; "),
  );
  error.name = "SkippedLocalDraftsError";
  error.code = skippedDrafts[0].error.code;
  return error;
};

// Reports the drafts that were not reported yet. The stored ids are then those
// of the drafts that are still left out, so the list never grows past the
// drafts in storage. A storage error that kept cached state from being fully
// rebuilt without them is reported too: the open project no longer uses that
// state.
export const reportSkippedDrafts = (
  deps,
  { projectId, skippedDrafts, rebuildError },
) => {
  const { appService } = deps;
  if (rebuildError) {
    appService.reportError(rebuildError, {
      operation: "projectHistory.rebuildWithoutSkippedDrafts",
    });
  }
  const configKey = getReportedSkippedDraftsConfigKey(projectId);
  const reportedDraftIds = new Set(appService.getUserConfig(configKey) ?? []);
  const skippedDraftIds = skippedDrafts.map(({ draftId }) => draftId);
  const newSkippedDrafts = skippedDrafts.filter(
    ({ draftId }) => !reportedDraftIds.has(draftId),
  );

  if (newSkippedDrafts.length > 0) {
    const error = createSkippedDraftsError(newSkippedDrafts);
    appService.reportError(error, {
      operation: "projectHistory.loadDrafts",
      code: error.code,
    });
  }

  if (
    newSkippedDrafts.length > 0 ||
    skippedDraftIds.length !== reportedDraftIds.size
  ) {
    appService.setUserConfig(
      configKey,
      skippedDraftIds.length > 0 ? skippedDraftIds : undefined,
    );
  }
};

// Keeps the operation name it had when left-out drafts were also shown to the
// user, so these reports stay grouped with earlier ones.
const reportStreamFailure = (deps, error) => {
  console.error("[projectHistory] Failed to report left-out changes", error);
  deps.appService.reportError(error, {
    operation: "projectHistory.notifySkippedDrafts",
  });
};

// `projectId$` emits the id of the open project after each route that needs
// it, or undefined once it is closed. While a project is open, its history can
// load at any time. Subscribing again after each route follows a repository
// that was opened again without a route change; drafts already reported are
// not reported again.
export const createSkippedDraftsReportStream = ({ deps, projectId$ }) => {
  const { projectService } = deps;

  return projectId$.pipe(
    switchMap((projectId) =>
      projectId
        ? new Observable((subscriber) =>
            projectService.subscribeSkippedDrafts(
              (payload) => subscriber.next(payload),
              { projectId },
            ),
          ).pipe(
            catchError((error) => {
              reportStreamFailure(deps, error);
              return EMPTY;
            }),
          )
        : EMPTY,
    ),
    tap((payload) => {
      try {
        reportSkippedDrafts(deps, payload);
      } catch (error) {
        reportStreamFailure(deps, error);
      }
    }),
  );
};
