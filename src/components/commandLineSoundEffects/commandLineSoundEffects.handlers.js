import { toFlatItems } from "../../internal/project/tree.js";
import { generateId } from "../../internal/id.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const getDropdownPositionFromEvent = (event) => {
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  if (rect) {
    return { x: rect.left, y: rect.bottom };
  }

  return { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
};

const isSelectionKey = (event) => {
  return event.key === "Enter" || event.key === " ";
};

const openSfxGallery = ({ store, render, channelId, index }) => {
  store.setPendingInsertion({ channelId, index });
  store.setTempSelectedResource({ resourceId: undefined });
  store.setMode({ mode: "gallery" });
  render();
};

const selectSoundFromEvent = (store, event) => {
  const { channelId, soundId } = event.currentTarget.dataset;
  store.setSelectedSound({ channelId, soundId });
  return { channelId, soundId };
};

const showChannelMenu = async (deps, event, position) => {
  const { store, render, appService, i18n } = deps;
  const channelId = event.currentTarget.dataset.channelId;
  const channelIndex = store.selectChannelIndexById({ channelId });
  const channels = store.selectChannels();
  store.setSelectedChannel({ channelId });
  render();

  const copy = selectCommandLineCopy(i18n);
  const items = [];
  if (channelIndex > 0) {
    items.push({
      type: "item",
      label: localizeCommandLineText("Move Up", copy),
      key: "move-up",
    });
  }
  if (channelIndex >= 0 && channelIndex < channels.length - 1) {
    items.push({
      type: "item",
      label: localizeCommandLineText("Move Down", copy),
      key: "move-down",
    });
  }
  items.push({
    type: "item",
    label: localizeCommandLineText("Delete", copy),
    key: "delete",
  });

  const menuPosition = position ?? getDropdownPositionFromEvent(event);
  const result = await appService.showDropdownMenu({
    items,
    x: menuPosition.x,
    y: menuPosition.y,
    place: "bs",
  });
  const actionKey = result?.item?.key;
  if (actionKey === "move-up") {
    store.moveChannel({ channelId, direction: "up" });
  } else if (actionKey === "move-down") {
    store.moveChannel({ channelId, direction: "down" });
  } else if (actionKey === "delete") {
    store.removeChannel({ channelId });
  } else {
    return;
  }
  render();
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { sounds } = projectService.getState();

  store.setRepositoryState({ sounds });
  store.setSfx({ sfx: props.sfx });
  render();
};

export const handleChannelClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();
  const channelId = payload._event.currentTarget.dataset.channelId;
  store.setSelectedChannel({ channelId });
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

export const handleChannelContextMenu = async (deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();
  await showChannelMenu(deps, payload._event, {
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
};

export const handleSoundClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();
  selectSoundFromEvent(store, payload._event);
  render();
};

export const handleSoundKeyDown = (deps, payload) => {
  const { _event: event } = payload;
  if (!isSelectionKey(event) || event.target !== event.currentTarget) {
    return;
  }

  event.preventDefault();
  handleSoundClick(deps, payload);
};

export const handleSoundDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();
  const { channelId, soundId } = selectSoundFromEvent(store, payload._event);
  const sound = store.selectSoundById({ channelId, soundId });
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
  const { channelId, soundId } = selectSoundFromEvent(store, event);
  const soundIndex = store.selectSoundIndexById({ channelId, soundId });
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
    openSfxGallery({ store, render, channelId, index: soundIndex });
    return;
  }
  if (actionKey === "insert-after") {
    openSfxGallery({ store, render, channelId, index: soundIndex + 1 });
    return;
  }
  if (actionKey === "remove") {
    store.removeSound({ channelId, soundId });
    render();
  }
};

export const handleEmptyAddClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const channelId = payload._event.currentTarget.dataset.channelId;
  openSfxGallery({ store, render, channelId, index: 0 });
};

export const handleEdgeAddClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;
  const { channelId, insertIndex } = payload._event.currentTarget.dataset;
  openSfxGallery({
    store,
    render,
    channelId,
    index: Number.parseInt(insertIndex, 10),
  });
};

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const values = payload._event.detail.values;
  const channelId = store.selectSelectedChannelId();
  const soundId = store.selectSelectedSoundId();
  if (!channelId) {
    return;
  }

  if (soundId === undefined) {
    store.updateChannel({ channelId, values });
  } else {
    store.updateSound({ channelId, soundId, values });
  }
  render();
};

export const handleAddChannelClick = (deps, payload) => {
  const { store, render } = deps;
  store.openAddChannelPopover({
    position: getDropdownPositionFromEvent(payload._event),
  });
  render();
};

export const handleAddChannelPopoverClose = (deps) => {
  const { store, render } = deps;
  store.hideAddChannelPopover();
  render();
};

export const handleAddChannelFormAction = (deps, payload) => {
  const { store, render, appService, i18n } = deps;
  const detail = payload._event.detail;
  if (detail.actionId !== "submit") {
    return;
  }

  const channelId = String(detail.values?.name ?? "").trim();
  if (!channelId) {
    return;
  }
  if (store.selectChannelById({ channelId })) {
    appService.showToast({
      message: localizeCommandLineText(
        "Channel name must be unique.",
        selectCommandLineCopy(i18n),
      ),
    });
    return;
  }

  store.addChannel({ id: channelId });
  store.hideAddChannelPopover();
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
        sfx: store.selectSfx(),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const { id } = payload._event.detail;

  if (id === "actions") {
    store.hideAddChannelPopover();
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
  const channelId = store.selectPendingChannelId();
  if (!resourceId || !channelId) {
    return;
  }

  store.insertSound({
    channelId,
    id: generateId(),
    resourceId,
    index: store.selectPendingInsertIndex(),
  });
  store.setMode({ mode: "current" });
  render();
};
