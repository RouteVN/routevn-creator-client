import { toFlatItems } from "../../deps/repository";
import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const {
    repositoryFactory,
    router,
    store,
    props,
    render,
    downloadWaveformData,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();

  store.setRepositoryState({
    audio,
  });

  if (props?.line?.presentation?.sfx?.items) {
    const { items } = props.line.presentation.sfx;
    if (items && items.length > 0) {
      store.setExistingSfx({
        sfx: items,
      });
    }
  }

  const sfx = store.selectSfxWithAudioData();

  if (!sfx || sfx.length === 0) {
    return;
  }

  const context = {};

  // Load waveform data for each existing sound effect
  for (const [index, sfx] of sfx.entries()) {
    if (sfx.waveformDataFileId) {
      try {
        const waveformData = await downloadWaveformData({
          fileId: sfx.waveformDataFileId,
        });
        context[`sfx[${index}]`] = { waveformData };
      } catch (error) {
        console.error(`Failed to load waveform data for sfx[${index}]:`, error);
        throw error;
      }
    }
  }

  store.setContext(context);
  render();
};

export const handleFormExtra = async (e, deps) => {
  const { store, render } = deps;
  const { name } = e.detail;

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

export const handleFormChange = (e, deps) => {
  // No longer needed since we removed trigger functionality
};

export const handleAddNewClick = (e, deps) => {
  e.stopPropagation();
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

export const handleSfxClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("sfx-", "");

  store.setCurrentEditingId({
    id: id,
  });
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleSfxContextMenu = (e, deps) => {
  e.preventDefault();
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("sfx-", "");
  const rect = e.currentTarget.getBoundingClientRect();

  store.showDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    sfxId: id,
  });

  render();
};

export const handleResourceItemClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("resource-item-", "");

  store.setTempSelectedResourceId({
    resourceId: id,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  e.stopPropagation();

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

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (e.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  }
};

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render } = deps;
  const { detail } = e;

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

export const handleButtonSelectClick = async (e, deps) => {
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
