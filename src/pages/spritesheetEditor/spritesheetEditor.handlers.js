import { concatMap, debounceTime, filter, from } from "rxjs";
import {
  createSpritesheetEditorPayload,
  getSpritesheetEditorBackPath,
  resolveSpritesheetEditorPayload,
} from "../../internal/spritesheetEditorRoute.js";
import { resolveEditHistoryShortcut } from "../../internal/ui/editHistory.js";
import { formatI18nCopy, selectI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { enqueueSceneEditorPersistence } from "../../internal/ui/sceneEditor/persistenceQueue.js";
import { buildSpritesheetDataFromFramesDraft } from "../../internal/ui/spritesheetFramesSave.js";

const selectCopy = (deps) =>
  selectI18nCopy(deps.i18n, ["spritesheetEditorPage"]);

// Edits save on their own once the frames have been still this long. A save
// that adds pictures draws and uploads a new sheet, so it waits longer than
// other editors.
const AUTOSAVE_DEBOUNCE_MS = 1000;
const AUTOSAVE_ACTION = "spritesheetEditor.autosave";

const navigateBack = ({ appService, store }) => {
  const target = store.selectTarget() ?? {};
  appService.navigate(
    getSpritesheetEditorBackPath(target),
    createSpritesheetEditorPayload({
      payload: appService.getPayload() ?? {},
    }),
    { historyMode: "replace" },
  );
};

// The spritesheet the editor works on: a spritesheet resource or a
// character's spritesheet sprite.
const selectTargetItem = (repositoryState, target = {}) => {
  const item = target.characterId
    ? repositoryState?.characters?.items?.[target.characterId]?.sprites
        ?.items?.[target.spriteId]
    : repositoryState?.spritesheets?.items?.[target.spritesheetId];

  return item?.type === "spritesheet" ? item : undefined;
};

const updateTarget = ({ projectService, target, data, fileRecords }) => {
  if (target.characterId) {
    return projectService.updateCharacterSpriteItem({
      characterId: target.characterId,
      spriteId: target.spriteId,
      fileRecords,
      data,
    });
  }

  return projectService.updateSpritesheet({
    spritesheetId: target.spritesheetId,
    fileRecords,
    data,
  });
};

// Saves the frames when they changed. A draft that cannot be saved yet, such
// as a clip without frames, is reported back instead of shown, so leaving can
// offer to discard it; only a failure to build or store the sheet is shown.
const saveDraft = async (deps) => {
  const { appService, i18n, projectService, refs, store } = deps;
  if (store.selectShouldDiscardChanges()) {
    return { ok: true };
  }

  const draft = refs.framesEditor.getDraft();
  if (!draft.hasChanges) {
    return { ok: true };
  }

  const target = store.selectTarget();
  const item = selectTargetItem(projectService.getRepositoryState(), target);
  if (!item) {
    return { ok: false, message: selectCopy(deps).spritesheetNotFound };
  }

  const framesResult = await buildSpritesheetDataFromFramesDraft({
    appService,
    projectService,
    i18n,
    draft,
    name: item.name,
    existingItem: item,
    notify: false,
  });
  if (!framesResult.ok) {
    if (framesResult.error) {
      showResourcePageError({
        appService,
        errorOrResult: framesResult.error,
        fallbackMessage: framesResult.message,
      });
    }
    return framesResult;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: selectCopy(deps).failedSaveSpritesheet,
    action: () =>
      updateTarget({
        projectService,
        target,
        data: framesResult.data,
        fileRecords: framesResult.fileRecords,
      }),
  });
  if (!updateAttempt.ok) {
    return { ok: false };
  }

  refs.framesEditor.markSaved({
    fileIdByFrameKey: framesResult.fileIdByFrameKey,
    sourceIndexByFrameKey: framesResult.sourceIndexByFrameKey,
    content: draft.content,
  });
  return { ok: true };
};

// Saves run one at a time, so a save on leaving waits for a running autosave
// and then saves what it missed. An unexpected failure is shown and reported
// back, so autosave keeps running for later edits.
const saveSpritesheetChanges = (deps) => {
  const { appService, projectService } = deps;
  return enqueueSceneEditorPersistence({
    owner: projectService,
    task: async () => {
      try {
        return await saveDraft(deps);
      } catch (error) {
        showResourcePageError({
          appService,
          errorOrResult: error,
          fallbackMessage: selectCopy(deps).failedSaveSpritesheet,
        });
        return { ok: false };
      }
    },
  });
};

// Leaving saves the frames first. When they cannot be saved, the user can
// leave without saving or stay.
const confirmLeaving = async (deps) => {
  const { appService, store } = deps;
  const result = await saveSpritesheetChanges(deps);
  if (result.ok) {
    return true;
  }

  const copy = selectCopy(deps);
  const leave = await appService.showDialog({
    title: copy.leaveWithoutSavingTitle,
    message: result.message
      ? formatI18nCopy(copy.leaveWithoutSavingReasonMessage, {
          reason: result.message,
        })
      : copy.leaveWithoutSavingMessage,
    confirmText: copy.leaveButton,
    cancelText: copy.stayButton,
  });
  if (leave) {
    store.discardChanges();
  }
  return leave;
};

const queueAutosave = ({ subject }) => {
  subject.dispatch(AUTOSAVE_ACTION, {});
};

const runHistoryStep = async (deps, direction) => {
  const { refs } = deps;
  await (direction === "undo"
    ? refs.framesEditor.undo()
    : refs.framesEditor.redo());
};

export const handleBeforeMount = (deps) => {
  const { appService, browserEventsClient, subject } = deps;
  const autosaveSubscription = subject
    .pipe(
      filter(({ action }) => action === AUTOSAVE_ACTION),
      debounceTime(AUTOSAVE_DEBOUNCE_MS),
      concatMap(() => from(saveSpritesheetChanges(deps))),
    )
    .subscribe();
  const cleanupKeyboardShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) => handleWindowKeyDown(deps, { _event: event }),
  });
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async ({ reason } = {}) => {
      // A backup, the app going to the background, or quitting keeps no
      // dialog open: it saves what it can and goes on.
      if (reason) {
        await saveSpritesheetChanges(deps);
        return;
      }

      if (!(await confirmLeaving(deps))) {
        throw new Error("Stayed on the spritesheet editor to keep changes.");
      }
    },
  );

  return () => {
    unregisterBeforeNavigation();
    autosaveSubscription.unsubscribe();
    cleanupKeyboardShortcuts();
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, refs, render, store } = deps;
  const copy = selectCopy(deps);
  await projectService.ensureRepository();
  const target = resolveSpritesheetEditorPayload(appService.getPayload() ?? {});
  const item = selectTargetItem(projectService.getRepositoryState(), target);
  store.setTarget({ target, spritesheetName: item?.name });
  if (!item) {
    appService.showAlert({
      title: copy.errorTitle,
      message: copy.spritesheetNotFound,
    });
    navigateBack(deps);
    return;
  }

  render();
  await refs.framesEditor.loadSpritesheet({ spritesheet: item });
};

// An edit, undo, or redo in the frames editor saves a moment later.
export const handleFramesChange = (deps, payload) => {
  const { render, store } = deps;
  store.keepChanges();
  store.setEditHistoryState(payload._event.detail);
  render();
  queueAutosave(deps);
};

export const handleUndoButtonClick = (deps) => runHistoryStep(deps, "undo");

export const handleRedoButtonClick = (deps) => runHistoryStep(deps, "redo");

// Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes, except in a text field or
// a dialog.
export const handleWindowKeyDown = async (deps, payload) => {
  const event = payload._event;
  const direction = resolveEditHistoryShortcut(event);
  if (!direction) {
    return;
  }

  event.preventDefault();
  await runHistoryStep(deps, direction);
};

export const handleBackClick = async (deps) => {
  if (await confirmLeaving(deps)) {
    navigateBack(deps);
  }
};
