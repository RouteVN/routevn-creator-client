import { toFlatItems } from "../../deps/repository";
import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { audio } = repository.getState();

  store.setRepositoryState({
    audio,
  });

  if (!props?.line?.presentation?.soundEffects) {
    return;
  }

  const { soundEffects } = props.line.presentation;

  if (!soundEffects || soundEffects.length === 0) {
    return;
  }

  store.setExistingSoundEffects({
    soundEffects,
  });
};

export const handleAfterMount = async (deps) => {
  const { store, render, downloadWaveformData } = deps;

  const soundEffects = store.selectSoundEffectsWithAudioData();

  if (!soundEffects || soundEffects.length === 0) {
    return;
  }

  const context = {};

  // Load waveform data for each existing sound effect
  for (const [index, sfx] of soundEffects.entries()) {
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
    const soundEffects = store.selectSoundEffects();
    const soundEffect = soundEffects[index];
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

export const handleSoundEffectClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("sound-effect-", "");

  store.setCurrentEditingId({
    id: id,
  });
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleSoundEffectContextMenu = (e, deps) => {
  e.preventDefault();
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("sound-effect-", "");
  const rect = e.currentTarget.getBoundingClientRect();

  store.showDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    soundEffectId: id,
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
  const soundEffects = store.selectSoundEffects();
  const filteredEffects = soundEffects.filter((se) => se.resourceId);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        soundEffects: filteredEffects.map((sfx) => ({
          id: sfx.id,
          resourceId: sfx.resourceId,
        })),
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
  const soundEffectId = store.selectDropdownMenuSoundEffectId();

  store.hideDropdownMenu();

  if (item.value === "delete" && soundEffectId) {
    store.deleteSoundEffect({
      id: soundEffectId,
    });
  }

  render();
};

export const handleButtonSelectClick = (e, deps) => {
  const { store, render, repository } = deps;

  const { audio } = repository.getState();

  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedResourceId,
  );

  if (tempSelectedAudio) {
    const currentEditingId = store.selectCurrentEditingId();
    const soundEffects = store.selectSoundEffects();
    const existingEffect = soundEffects.find(
      (se) => se.id === currentEditingId,
    );

    if (existingEffect) {
      // Update existing sound effect
      store.updateSoundEffect({
        id: currentEditingId,
        resourceId: tempSelectedResourceId,
        name: tempSelectedAudio.name,
      });
    } else {
      // Create new sound effect (this was triggered by "Add New" button)
      store.addSoundEffect({
        id: currentEditingId,
      });
      store.updateSoundEffect({
        id: currentEditingId,
        resourceId: tempSelectedResourceId,
        name: tempSelectedAudio.name,
      });
    }

    store.setMode({
      mode: "current",
    });
    render();
  }
};
