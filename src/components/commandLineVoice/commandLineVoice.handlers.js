import { buildVoiceResourceDataFromUploadResult } from "../../deps/services/shared/resourceImports.js";
import { generateId } from "../../internal/id.js";

const VOICE_FILE_ACCEPT = ".mp3,.wav,.ogg";
const VOICE_FILE_PATTERN = /\.(mp3|wav|ogg)$/i;

const showAlert = (appService, { message, title = "Error" } = {}) => {
  appService?.showAlert?.({
    message,
    title,
  });
};

const getCurrentSceneId = (props = {}) =>
  typeof props.currentSceneId === "string" && props.currentSceneId.length > 0
    ? props.currentSceneId
    : undefined;

const syncRepositoryState = (projectService, store) => {
  const { voices } = projectService.getState();
  store.setRepositoryState({
    voices,
  });
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  syncRepositoryState(projectService, store);

  if (props.voice) {
    store.setVoice({ voice: props.voice });
  }

  render();
};

export const handleAudioWaveformClick = async (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { appService, projectService, props, store, render } = deps;
  const sceneId = getCurrentSceneId(props);

  if (!sceneId) {
    showAlert(appService, {
      message: "Select a scene before adding voice audio.",
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
      message: "Failed to upload voice.",
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!VOICE_FILE_PATTERN.test(file.name ?? "")) {
    showAlert(appService, {
      message:
        "Invalid file format. Please upload an audio file (.mp3, .wav, or .ogg).",
      title: "Warning",
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
      message: "Failed to upload voice.",
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
      message: "Failed to create voice.",
    });
    return;
  }

  if (createResult?.valid === false) {
    showAlert(appService, {
      message: "Failed to create voice.",
    });
    return;
  }

  syncRepositoryState(projectService, store);
  store.setVoiceAudio({
    resourceId: voiceId,
  });
  store.openAudioPlayer({
    fileId: uploadResult.fileId,
    fileName: uploadResult.displayName,
  });
  render();
};

export const handleAudioWaveformRightClick = async (deps, payload) => {
  const { _event: event } = payload;
  event.preventDefault();
  event.stopPropagation();

  const { store, render, globalUI } = deps;
  const selectedResource = store.selectSelectedResource();
  if (!selectedResource) {
    return;
  }

  const result = await globalUI.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  if (result?.item?.key === "remove") {
    store.clearVoiceAudio();
    render();
  }
};

export const handlePreviewClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;
  const selectedResource = store.selectSelectedResource();

  if (!selectedResource?.fileId) {
    return;
  }

  store.openAudioPlayer({
    fileId: selectedResource.fileId,
    fileName: selectedResource.name,
  });
  render();
};

export const handleLoopChange = (deps, payload) => {
  const { store, render } = deps;
  const loop =
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value;

  store.setLoop({ loop });
  render();
};

export const handleVolumeInput = (deps, payload) => {
  const { store, render } = deps;
  const value =
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value;

  store.setVolume({ volume: value });
  render();
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;
  store.closeAudioPlayer();
  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { appService, dispatchEvent, store } = deps;
  const voice = store.selectVoicePayload();

  if (!voice.resourceId) {
    showAlert(appService, {
      message: "Select a voice audio file first.",
      title: "Warning",
    });
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        voice,
      },
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
