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
  const { store, render, downloadWaveformData, httpClient } = deps;

  const soundEffects = store.selectSoundEffectsWithAudioData();

  if (!soundEffects || soundEffects.length === 0) {
    return;
  }

  const context = {};

  // Load waveform data for each existing sound effect
  for (const [index, sfx] of soundEffects.entries()) {
    if (sfx.waveformDataFileId) {
      try {
        const waveformData = await downloadWaveformData(
          sfx.waveformDataFileId,
          httpClient,
        );
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

  store.addSoundEffect({
    id: nanoid(),
  });
  render();
};

export const handleSoundEffectItemClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("sound-effect-item-", "");

  store.setCurrentEditingId({
    id: id,
  });
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleDeleteClick = (e, deps) => {
  e.stopPropagation();
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("delete-button-", "");

  store.deleteSoundEffect({
    id: id,
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

export const handleButtonSelectClick = async (e, deps) => {
  const { store, render, repository, downloadWaveformData, httpClient } = deps;

  const { audio } = repository.getState();

  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedResourceId,
  );

  if (tempSelectedAudio) {
    const currentEditingId = store.selectCurrentEditingId();
    const soundEffects = store.selectSoundEffects();
    const effectIndex = soundEffects.findIndex(
      (se) => se.id === currentEditingId,
    );

    store.updateSoundEffect({
      id: currentEditingId,
      resourceId: tempSelectedResourceId,
      name: tempSelectedAudio.name,
    });

    // Download waveform data if available
    if (effectIndex !== -1) {
      try {
        const waveformData = await downloadWaveformData(
          tempSelectedAudio.waveformDataFileId,
          httpClient,
        );

        const currentContext = store.selectContext() || {};
        const newContext = {
          ...currentContext,
          [`sfx[${effectIndex}]`]: { waveformData },
        };

        store.setContext(newContext);
      } catch (error) {
        console.error("Failed to load waveform data:", error);
      }
    }

    store.setMode({
      mode: "current",
    });
    render();
  }
};
