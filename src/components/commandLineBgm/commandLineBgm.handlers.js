import { toFlatItems } from "../../internal/project/tree.js";
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

const openBgmGallery = ({ store, render, index }) => {
  store.setPendingInsertIndex({ index });
  store.setTempSelectedResource({ resourceId: undefined });
  store.setMode({ mode: "gallery" });
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
  const sound = store.selectBgmSoundById({ soundId });
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
  const { sounds } = projectService.getState();

  store.setRepositoryState({ sounds });
  store.setBgm({ bgm: props.bgm });
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
    event.currentTarget?.classList?.contains("bgmChannel") &&
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
    const sound = store.selectBgmSoundById({ soundId });
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
  const sound = store.selectBgmSoundById({ soundId });
  const resource = store.selectSoundItemById({ itemId: sound?.resourceId });
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
  const soundIndex = store.selectBgmSoundIndexById({ soundId });
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
    openBgmGallery({ store, render, index: soundIndex });
    return;
  }
  if (actionKey === "insert-after") {
    openBgmGallery({ store, render, index: soundIndex + 1 });
    return;
  }
  if (actionKey === "remove") {
    store.removeSound({ soundId });
    render();
  }
};

export const handleEmptyAddClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  openBgmGallery({ store, render, index: 0 });
};

export const handleEdgeAddClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget.dataset.insertIndex,
    10,
  );
  openBgmGallery({ store, render, index });
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

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;

  store.setTempSelectedResource({ resourceId });
  render();
};

export const handleResourceItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;
  const selectedItem = store.selectSoundItemById({ itemId: resourceId });

  if (!selectedItem?.fileId) {
    return;
  }

  store.setTempSelectedResource({ resourceId });
  store.openAudioPlayer({
    fileId: selectedItem.fileId,
    fileName: selectedItem.name,
  });
  render();
};

export const handleFileExplorerItemClick = async (deps, payload) => {
  const {
    refs,
    store,
    render,
    downloadWaveformData,
    projectService,
    appService,
    i18n,
  } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    const groupElement = refs.galleryScroll?.querySelector(
      `[data-group-id="${itemId}"]`,
    );
    groupElement?.scrollIntoView?.({ block: "start" });
    return;
  }

  await projectService.ensureRepository();
  const { sounds } = projectService.getState();

  store.setTempSelectedResource({ resourceId: itemId });
  render();

  const selectedItem = toFlatItems(sounds).find((item) => item.id === itemId);
  if (selectedItem?.waveformDataFileId && downloadWaveformData) {
    try {
      await downloadWaveformData({
        fileId: selectedItem.waveformDataFileId,
      });
    } catch {
      appService.showToast({
        message: localizeCommandLineText(
          "Failed to load audio waveform.",
          selectCommandLineCopy(i18n),
        ),
      });
    }
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;
  store.closeAudioPlayer();
  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { dispatchEvent, store } = deps;

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        bgm: store.selectBgm(),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcumbActionsClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const { id } = payload._event.detail;

  if (id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
    return;
  }

  store.setMode({ mode: id });
  store.setTempSelectedResource({ resourceId: undefined });
  render();
};

export const handleButtonSelectClick = (deps) => {
  const { store, render } = deps;
  const resourceId = store.selectTempSelectedResourceId();
  if (!resourceId) {
    return;
  }

  store.insertSound({
    id: generateId(),
    resourceId,
    index: store.selectPendingInsertIndex(),
  });
  store.setMode({ mode: "current" });
  render();
};
