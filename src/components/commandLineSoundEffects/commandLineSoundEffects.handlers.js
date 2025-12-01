import { toFlatItems } from "insieme";
import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, props, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();

  store.setRepositoryState({
    audio,
  });

  if (props?.sfx?.items) {
    const { items } = props.sfx;
    if (items && items.length > 0) {
      store.setExistingSfxs({
        sfx: items,
      });
    }
  }

  const sfx = store.selectSfxWithAudioData();

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

  const id = payload._event.currentTarget.id.replace("sfx-", "");

  store.setCurrentEditingId({
    id: id,
  });
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleSfxContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;

  const id = payload._event.currentTarget.id.replace("sfx-", "");

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    sfxId: id,
  });

  render();
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;

  const id = payload._event.currentTarget.id.replace("resource-item-", "");

  store.setTempSelectedResourceId({
    resourceId: id,
  });

  render();
};

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();

  const { dispatchEvent, store } = deps;
  const sfx = store.selectSfxs();
  const filteredEffects = sfx.filter((se) => se.audioId);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sfx: {
          items: filteredEffects.map((sfx) => ({
            id: sfx.id,
            audioId: sfx.audioId,
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
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const { audio } = repository.getState();

  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedResourceId,
  );

  if (tempSelectedAudio) {
    const currentEditingId = store.selectCurrentEditingId();
    const sfx = store.selectSfxs();
    const existingEffect = sfx.find((se) => se.id === currentEditingId);

    if (existingEffect) {
      // Update existing sound effect
      store.updateSfx({
        id: currentEditingId,
        audioId: tempSelectedResourceId,
        name: tempSelectedAudio.name,
      });
    } else {
      // Create new sound effect (this was triggered by "Add New" button)
      store.addSfx({
        id: currentEditingId,
      });
      store.updateSfx({
        id: currentEditingId,
        audioId: tempSelectedResourceId,
        name: tempSelectedAudio.name,
      });
    }

    store.setMode({
      mode: "current",
    });
    render();
  }
};
