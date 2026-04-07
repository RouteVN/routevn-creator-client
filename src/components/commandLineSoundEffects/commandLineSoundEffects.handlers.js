import { toFlatItems } from "../../internal/project/tree.js";
import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { sounds } = projectService.getState();

  store.setRepositoryState({
    sounds,
  });

  if (props?.sfx?.items) {
    const { items } = props.sfx;
    if (items && items.length > 0) {
      store.setExistingSfxs({
        sfx: items,
      });
    }
  }

  const sfx = store.selectSfxWithSoundData();

  if (!sfx || sfx.length === 0) {
    return;
  }
  render();
};

export const handleFormExtra = async (deps, payload) => {
  const { store, render } = deps;
  const { name } = payload._event.detail;

  // Extract index from field name (e.g., "sfx[0]" -> 0)
  const match = name.match(/sfx\[(\d+)\]/);
  if (match) {
    const index = parseInt(match[1]);
    // Set current editing to this sound effect
    const sfx = store.selectSfxs();
    const soundEffect = sfx[index];
    if (soundEffect) {
      store.setCurrentEditingId({ id: soundEffect.id });
      store.setMode({ mode: "gallery" });
      render();
    }
  }
};

export const handleFormChange = () => {
  // No longer needed since we removed trigger functionality
};

const resolveSfxByIndex = (store, index) => {
  if (!Number.isInteger(index)) {
    return undefined;
  }

  return store.selectSfxs()[index];
};

export const handleSfxLoopChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index ?? "",
    10,
  );
  const soundEffect = resolveSfxByIndex(store, index);
  if (!soundEffect?.id) {
    return;
  }

  const loop =
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value;

  store.updateSfx({
    id: soundEffect.id,
    loop,
  });
  render();
};

export const handleSfxVolumeInput = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(
    payload._event.currentTarget?.dataset?.index ?? "",
    10,
  );
  const soundEffect = resolveSfxByIndex(store, index);
  if (!soundEffect?.id) {
    return;
  }

  const rawValue =
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value;
  const volume = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(volume)) {
    return;
  }

  store.updateSfx({
    id: soundEffect.id,
    volume,
  });
  render();
};

export const handleAddNewClick = (deps, payload) => {
  payload._event.stopPropagation();
  const { store, render } = deps;

  // Create a new sound effect but don't add it to the store yet
  const newId = nanoid();

  // Set it as currently editing and go to gallery mode
  store.setCurrentEditingId({
    id: newId,
  });
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleSfxClick = (deps, payload) => {
  const { store, render } = deps;

  const target = payload._event.currentTarget;
  const id = target?.dataset?.sfxId || target?.id?.replace("sfx", "") || "";

  store.setCurrentEditingId({
    id: id,
  });
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleSfxDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const sfxId = payload._event.currentTarget?.dataset?.sfxId;
  const soundEffect = store.selectSfxs().find((item) => item.id === sfxId);
  const soundItem = store.selectSoundItemById({
    itemId: soundEffect?.resourceId,
  });

  if (!soundItem?.fileId) {
    return;
  }

  store.openAudioPlayer({
    fileId: soundItem.fileId,
    fileName: soundItem.name,
  });
  render();
};

export const handleSfxContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;

  const target = payload._event.currentTarget;
  const id = target?.dataset?.sfxId || target?.id?.replace("sfx", "") || "";

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    sfxId: id,
  });

  render();
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;

  const target = payload._event.currentTarget;
  const id =
    target?.dataset?.resourceId ||
    target?.id?.replace("resourceItem", "") ||
    "";

  store.setTempSelectedResourceId({
    resourceId: id,
  });

  render();
};

export const handleResourceItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;
  const selectedItem = store.selectSoundItemById({ itemId: resourceId });

  if (!selectedItem?.fileId) {
    return;
  }

  store.setTempSelectedResourceId({
    resourceId,
  });
  store.openAudioPlayer({
    fileId: selectedItem.fileId,
    fileName: selectedItem.name,
  });
  render();
};

export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (!isFolder) {
    return;
  }

  const groupElement = refs.galleryScroll?.querySelector(
    `[data-group-id="${itemId}"]`,
  );
  groupElement?.scrollIntoView?.({ block: "start" });
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
  const sfx = store.selectSfxs();
  const filteredEffects = sfx.filter((se) => se.resourceId);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sfx: {
          items: filteredEffects.map((sfx) => ({
            id: sfx.id,
            resourceId: sfx.resourceId,
            volume: sfx.volume,
            loop: sfx.loop,
          })),
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  }
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { detail } = payload._event;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;
  const sfxId = store.selectDropdownMenuSfxId();

  store.hideDropdownMenu();

  if (item.value === "delete" && sfxId) {
    store.deleteSfx({
      id: sfxId,
    });
  }

  render();
};

export const handleButtonSelectClick = async (deps) => {
  const { store, render, projectService } = deps;
  await projectService.ensureRepository();

  const { sounds } = projectService.getState();

  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedSound = toFlatItems(sounds).find(
    (item) => item.id === tempSelectedResourceId,
  );

  if (tempSelectedSound) {
    const currentEditingId = store.selectCurrentEditingId();
    const sfx = store.selectSfxs();
    const existingEffect = sfx.find((se) => se.id === currentEditingId);

    if (existingEffect) {
      // Update existing sound effect
      store.updateSfx({
        id: currentEditingId,
        resourceId: tempSelectedResourceId,
        name: tempSelectedSound.name,
      });
    } else {
      // Create new sound effect (this was triggered by "Add New" button)
      store.addSfx({
        id: currentEditingId,
      });
      store.updateSfx({
        id: currentEditingId,
        resourceId: tempSelectedResourceId,
        name: tempSelectedSound.name,
      });
    }

    store.setMode({
      mode: "current",
    });
    render();
  }
};
