import { buildVoiceResourceDataFromUploadResult } from "../../deps/services/shared/resourceImports.js";
import { generateId } from "../../internal/id.js";
import {
  finishAudioTimelineDrag,
  mountAudioTimelineDragSubscriptions,
  moveAudioTimelineDrag,
  startAudioTimelineDrag,
} from "../../internal/ui/sceneEditor/audioTimelineDrag.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const VOICE_FILE_ACCEPT = ".mp3,.wav,.ogg";
const VOICE_FILE_PATTERN = /\.(mp3|wav|ogg)$/i;

const showAlert = (appService, { message, title = "Error" } = {}) => {
  appService.showAlert({ message, title });
};

const getCurrentSceneId = (props = {}) => {
  return typeof props.currentSceneId === "string" && props.currentSceneId.length
    ? props.currentSceneId
    : undefined;
};

const syncRepositoryState = (projectService, store) => {
  const { voices } = projectService.getState();
  store.setRepositoryState({ voices });
};

const pickAndCreateVoice = async (deps) => {
  const { appService, projectService, props, store, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const sceneId = getCurrentSceneId(props);

  if (!sceneId) {
    showAlert(appService, {
      message: localizeCommandLineText(
        "Select a scene before adding voice audio.",
        copy,
      ),
      title: localizeCommandLineText("Error", copy),
    });
    return;
  }

  await projectService.ensureRepository();

  let file;
  try {
    file = await appService.pickFiles({
      accept: VOICE_FILE_ACCEPT,
      multiple: false,
      upload: true,
    });
  } catch {
    showAlert(appService, {
      message: localizeCommandLineText("Failed to upload voice.", copy),
      title: localizeCommandLineText("Error", copy),
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!VOICE_FILE_PATTERN.test(file.name ?? "")) {
    showAlert(appService, {
      message: localizeCommandLineText(
        "Invalid file format. Please upload an audio file (.mp3, .wav, or .ogg).",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  const uploadResult = file.uploadResult;
  if (
    !uploadResult ||
    file.uploadSucessful === false ||
    file.uploadSuccessful === false
  ) {
    showAlert(appService, {
      message: localizeCommandLineText("Failed to upload voice.", copy),
      title: localizeCommandLineText("Error", copy),
    });
    return;
  }

  const voiceId = generateId();
  let createResult;
  try {
    createResult = await projectService.createVoice({
      voiceId,
      fileRecords: uploadResult.fileRecords,
      data: buildVoiceResourceDataFromUploadResult({
        uploadResult,
        sceneId,
      }),
      position: "last",
    });
  } catch {
    showAlert(appService, {
      message: localizeCommandLineText("Failed to create voice.", copy),
      title: localizeCommandLineText("Error", copy),
    });
    return;
  }

  if (createResult?.valid === false) {
    showAlert(appService, {
      message: localizeCommandLineText("Failed to create voice.", copy),
      title: localizeCommandLineText("Error", copy),
    });
    return;
  }

  syncRepositoryState(projectService, store);
  return voiceId;
};

const pickAndInsertVoice = async (deps, index) => {
  const voiceId = await pickAndCreateVoice(deps);
  if (!voiceId) {
    return;
  }

  const { store, render } = deps;
  store.insertSound({
    id: voiceId,
    resourceId: voiceId,
    index,
  });
  render();
};

const selectSoundFromEvent = (store, event) => {
  const soundId = event.currentTarget.dataset.soundId;
  store.setSelectedSound({ soundId });
  return soundId;
};

const isSelectionKey = (event) => {
  return event.key === "Enter" || event.key === " ";
};

const syncSelectedSoundForm = ({ refs, store }) => {
  const soundId = store.selectSelectedSoundId();
  const sound = store.selectVoiceSoundById({ soundId });
  if (!sound) {
    return;
  }

  refs.form.setValues({
    values: {
      startDelayMs: sound.startDelayMs,
      volume: sound.volume,
    },
  });
};

export const handleBeforeMount = (deps) => {
  return mountAudioTimelineDragSubscriptions(deps);
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  syncRepositoryState(projectService, store);
  store.setVoice({ voice: props.voice });
  render();
};

export const handleChannelClick = (deps, payload) => {
  const { store, render } = deps;
  const { _event: event } = payload;
  if (
    store.selectShouldSuppressChannelClick({
      eventTimeStamp: event.timeStamp,
    })
  ) {
    return;
  }
  if (
    event.currentTarget?.classList?.contains("voiceChannel") &&
    event.target !== event.currentTarget
  ) {
    return;
  }

  event.stopPropagation();
  store.clearSelectedSound();
  render();
};

export const handleChannelKeyDown = (deps, payload) => {
  const { _event: event } = payload;
  if (!isSelectionKey(event) || event.target !== event.currentTarget) {
    return;
  }

  event.preventDefault();
  handleChannelClick(deps, payload);
};

export const handleSoundClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();
  selectSoundFromEvent(store, payload._event);
  render();
};

export const handleSoundKeyDown = (deps, payload) => {
  const { _event: event } = payload;
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const { store, render } = deps;
    event.preventDefault();
    event.stopPropagation();
    const soundId = selectSoundFromEvent(store, event);
    const sound = store.selectVoiceSoundById({ soundId });
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const stepMs = event.shiftKey ? 1000 : 100;
    store.updateSound({
      soundId,
      values: {
        startDelayMs: sound.startDelayMs + direction * stepMs,
      },
    });
    render();
    syncSelectedSoundForm(deps);
    return;
  }

  if (!isSelectionKey(event)) {
    return;
  }

  event.preventDefault();
  handleSoundClick(deps, payload);
};

export const handleSoundDragPointerDown = (deps, payload) => {
  startAudioTimelineDrag(deps, payload._event);
};

export const handleWindowPointerMove = (deps, payload) => {
  moveAudioTimelineDrag(deps, payload._event);
};

export const handleWindowPointerUp = (deps, payload) => {
  if (finishAudioTimelineDrag(deps, payload._event)) {
    syncSelectedSoundForm(deps);
  }
};

export const handleWindowPointerCancel = (deps, payload) => {
  if (finishAudioTimelineDrag(deps, payload._event)) {
    syncSelectedSoundForm(deps);
  }
};

export const handleSoundDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();
  const soundId = selectSoundFromEvent(store, payload._event);
  const sound = store.selectVoiceSoundById({ soundId });
  const resource = store.selectVoiceItemById({ itemId: sound.resourceId });
  if (!resource?.fileId) {
    render();
    return;
  }

  store.openAudioPlayer({
    fileId: resource.fileId,
    fileName: resource.name,
  });
  render();
};

export const handleSoundContextMenu = async (deps, payload) => {
  const { store, render, appService, i18n } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  event.stopPropagation();
  const soundId = selectSoundFromEvent(store, event);
  const soundIndex = store.selectVoiceSoundIndexById({ soundId });
  render();

  const copy = selectCommandLineCopy(i18n);
  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: localizeCommandLineText("Insert Sound Before", copy),
        key: "insert-before",
      },
      {
        type: "item",
        label: localizeCommandLineText("Insert Sound After", copy),
        key: "insert-after",
      },
      {
        type: "item",
        label: localizeCommandLineText("Remove", copy),
        key: "remove",
      },
    ],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  const actionKey = result?.item?.key;
  if (actionKey === "insert-before") {
    await pickAndInsertVoice(deps, soundIndex);
    return;
  }
  if (actionKey === "insert-after") {
    await pickAndInsertVoice(deps, soundIndex + 1);
    return;
  }
  if (actionKey === "remove") {
    store.removeSound({ soundId });
    render();
  }
};

export const handleEmptyAddClick = async (deps, payload) => {
  payload._event.stopPropagation();
  await pickAndInsertVoice(deps, 0);
};

export const handleEdgeAddClick = async (deps, payload) => {
  payload._event.stopPropagation();
  const index = Number.parseInt(
    payload._event.currentTarget.dataset.insertIndex,
    10,
  );
  await pickAndInsertVoice(deps, index);
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const values = payload._event.detail.values;
  const selectedSoundId = store.selectSelectedSoundId();

  if (selectedSoundId === undefined) {
    store.updateChannel({ values });
  } else {
    store.updateSound({ soundId: selectedSoundId, values });
  }
  render();
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;
  store.closeAudioPlayer();
  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { appService, dispatchEvent, store, i18n } = deps;
  const copy = selectCommandLineCopy(i18n);
  const voice = store.selectVoicePayload();

  if (voice.sounds.length === 0) {
    showAlert(appService, {
      message: localizeCommandLineText(
        "Select a voice audio file first.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: { voice },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
