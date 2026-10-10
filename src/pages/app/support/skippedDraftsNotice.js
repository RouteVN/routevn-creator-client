import {
  EMPTY,
  Observable,
  catchError,
  concatMap,
  from,
  switchMap,
} from "rxjs";
import { withErrorDetails } from "../../../internal/errorDetails.js";
import {
  describeDraftSection,
  selectSceneEditorCopy,
} from "../../../internal/ui/sceneEditor/sceneEditorCopy.js";

// Local drafts that no longer apply when a project's history loads are left
// out of the project but kept in storage. The user is told once per draft.

export const getNotifiedSkippedDraftsConfigKey = (projectId) =>
  `projectHistory.notifiedSkippedDrafts.${projectId}`;

// Fills each `{name}` once, so a value that contains braces or `$` stays as
// it is.
const fillCopy = (template, values) =>
  template.replace(/\{(\w+)\}/g, (placeholder, key) =>
    Object.hasOwn(values, key) ? values[key] : placeholder,
  );

const SCENE_COMMAND_TYPE_PATTERN = /^(scene|section|line)\./;

// One line for each section or scene that lost changes, one for changes to
// scenes that are no longer in the project, and one for changes outside
// scenes.
const describeSkippedDraftLocations = (deps, skippedDrafts) => {
  const copy = selectSceneEditorCopy(deps.i18n);
  const sceneLocations = new Map();
  let hasChangesToMissingScenes = false;
  let hasChangesOutsideScenes = false;

  for (const { type, sceneId, sectionId } of skippedDrafts) {
    if (!sceneId && SCENE_COMMAND_TYPE_PATTERN.test(type)) {
      hasChangesToMissingScenes = true;
      continue;
    }
    if (!sceneId) {
      hasChangesOutsideScenes = true;
      continue;
    }

    const locationKey = JSON.stringify([sceneId, sectionId]);
    if (sceneLocations.has(locationKey)) {
      continue;
    }

    const { sceneName, sectionName } = describeDraftSection(deps, {
      sceneId,
      sectionId,
    });
    sceneLocations.set(
      locationKey,
      sectionId
        ? fillCopy(copy.changesNotLoadedSection, {
            sceneName,
            sectionName,
          })
        : fillCopy(copy.changesNotLoadedScene, { sceneName }),
    );
  }

  const locations = [...sceneLocations.values()];
  if (hasChangesToMissingScenes) {
    locations.push(copy.changesNotLoadedMissingScene);
  }
  if (hasChangesOutsideScenes) {
    locations.push(copy.changesNotLoadedOutsideScenes);
  }
  return locations;
};

// The left-out drafts as one error, for the report and the alert's details.
const createSkippedDraftsError = (skippedDrafts) => {
  const error = new Error(
    skippedDrafts
      .map(({ type, error: draftError }) => `${type}: ${draftError.message}`)
      .join("; "),
  );
  error.name = "SkippedLocalDraftsError";
  error.code = skippedDrafts[0].error.code;
  return error;
};

// Shows one alert for the drafts the user has not been told about yet. The
// stored ids are then those of the drafts that are still left out, so the
// list never grows past the drafts in storage.
export const notifySkippedDrafts = async (
  deps,
  { projectId, skippedDrafts },
) => {
  const { appService, i18n } = deps;
  const configKey = getNotifiedSkippedDraftsConfigKey(projectId);
  const notifiedDraftIds = new Set(appService.getUserConfig(configKey) ?? []);
  const skippedDraftIds = skippedDrafts.map(({ draftId }) => draftId);
  const newSkippedDrafts = skippedDrafts.filter(
    ({ draftId }) => !notifiedDraftIds.has(draftId),
  );

  if (newSkippedDrafts.length === 0) {
    if (skippedDraftIds.length !== notifiedDraftIds.size) {
      appService.setUserConfig(
        configKey,
        skippedDraftIds.length > 0 ? skippedDraftIds : undefined,
      );
    }
    return;
  }

  const copy = selectSceneEditorCopy(i18n);
  const message = fillCopy(copy.changesNotLoaded, {
    locations: describeSkippedDraftLocations(deps, newSkippedDrafts)
      .map((location) => `• ${location}`)
      .join("\n"),
  });
  const error = createSkippedDraftsError(newSkippedDrafts);

  appService.reportError(error, {
    operation: "projectHistory.loadDrafts",
    code: error.code,
  });
  await appService.showAlertWhenIdle({
    title: copy.errorTitle,
    message: withErrorDetails(message, error, copy.errorDetailsLabel),
  });
  appService.setUserConfig(configKey, skippedDraftIds);
};

const reportNoticeFailure = (deps, error) => {
  console.error("[projectHistory] Failed to report left-out changes", error);
  deps.appService.reportError(error, {
    operation: "projectHistory.notifySkippedDrafts",
  });
  return EMPTY;
};

// `projectId$` emits the id of the open project after each route that needs
// it, or undefined once it is closed. While a project is open, its history can
// load at any time. Subscribing again after each route follows a repository
// that was opened again without a route change; drafts the user was told
// about are not shown again.
export const createSkippedDraftsNoticeStream = ({ deps, projectId$ }) => {
  const { projectService } = deps;

  return projectId$.pipe(
    switchMap((projectId) =>
      projectId
        ? new Observable((subscriber) =>
            projectService.subscribeSkippedDrafts(
              (payload) => subscriber.next(payload),
              { projectId },
            ),
          ).pipe(catchError((error) => reportNoticeFailure(deps, error)))
        : EMPTY,
    ),
    concatMap((payload) =>
      from(notifySkippedDrafts(deps, payload)).pipe(
        catchError((error) => reportNoticeFailure(deps, error)),
      ),
    ),
  );
};
