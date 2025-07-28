import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, render, props } = deps;
  const { audio } = repository.getState();
  store.setItems({
    items: audio,
  });

  // Initialize with existing SFX data if available
  if (
    props?.line?.presentation?.soundEffects &&
    Array.isArray(props.line.presentation.soundEffects)
  ) {
    const flatAudioItems = toFlatItems(audio);
    const existingSfxData = props.line.presentation.soundEffects.map((sfx) => {
      const audioItem = flatAudioItems.find((item) => item.id === sfx.audioId);
      return {
        id: sfx.id,
        audioId: sfx.audioId,
        fileId: audioItem?.fileId || null,
        trigger: sfx.trigger || "click",
        name: audioItem?.name || "Sound Effect",
      };
    });

    store.setExistingSoundEffects({
      soundEffects: existingSfxData,
    });
  }
};

export const handleAfterMount = async (deps) => {
  const { repository, store, render, props, downloadWaveformData, httpClient } =
    deps;
  const { audio } = repository.getState();

  // Load waveform data for existing sound effects if available
  if (
    props?.line?.presentation?.soundEffects &&
    Array.isArray(props.line.presentation.soundEffects)
  ) {
    const flatAudioItems = toFlatItems(audio);
    const fieldResources = {};

    // Load waveform data for each existing sound effect
    for (let i = 0; i < props.line.presentation.soundEffects.length; i++) {
      const sfx = props.line.presentation.soundEffects[i];
      const audioItem = flatAudioItems.find((item) => item.id === sfx.audioId);

      if (audioItem?.waveformDataFileId && downloadWaveformData) {
        try {
          const waveformData = await downloadWaveformData(
            audioItem.waveformDataFileId,
            httpClient,
          );
          fieldResources[`sfx[${i}]`] = { waveformData };
        } catch (error) {
          console.error(`Failed to load waveform data for sfx[${i}]:`, error);
        }
      }
    }

    // Update field resources if we have any waveform data
    if (Object.keys(fieldResources).length > 0) {
      store.setFieldResources(fieldResources);
      render();
    }
  }
};

export const handleOnUpdate = () => {};

export const handleFormExtra = async (e, deps) => {
  const { store, render } = deps;
  const { name } = e.detail;

  // Extract index from field name (e.g., "sfx[0]" -> 0)
  const match = name.match(/sfx\[(\d+)\]/);
  if (match) {
    const index = parseInt(match[1]);
    // Set current editing to this sound effect
    const soundEffect = store.getState().soundEffects[index];
    if (soundEffect) {
      store.setCurrentEditingId({ id: soundEffect.id });
      store.setMode({ mode: "gallery" });
      render();
    }
  }
};

export const handleFormChange = (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  // Handle trigger field changes
  const triggerMatch = name.match(/sfx\[(\d+)\]\.trigger/);
  if (triggerMatch) {
    const index = parseInt(triggerMatch[1]);
    const soundEffect = store.getState().soundEffects[index];
    if (soundEffect) {
      store.updateSoundEffect({
        id: soundEffect.id,
        trigger: fieldValue,
      });
      render();
    }
  }
};

export const handleAddNewClick = (e, deps) => {
  e.stopPropagation();
  const { store, render } = deps;

  store.addSoundEffect();
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

export const handleAudioItemClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("audio-item-", "");

  store.setTempSelectedAudioId({
    audioId: id,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  e.stopPropagation();

  const { dispatchEvent, store } = deps;
  const soundEffects = store.getState().soundEffects;
  const filteredEffects = soundEffects.filter((se) => se.audioId);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        soundEffects: filteredEffects.map((se) => ({
          id: se.id,
          audioId: se.audioId,
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

export const handleButtonSelectClickAudio = async (payload, deps) => {
  const { store, render, repository, downloadWaveformData, httpClient } = deps;

  const { audio } = repository.getState();

  const tempSelectedAudioId = store.selectTempSelectedAudioId();
  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedAudioId,
  );

  if (tempSelectedAudio) {
    const currentEditingId = store.getState().currentEditingId;
    const soundEffects = store.getState().soundEffects;
    const effectIndex = soundEffects.findIndex(
      (se) => se.id === currentEditingId,
    );

    store.updateSoundEffect({
      id: currentEditingId,
      audioId: tempSelectedAudioId,
      fileId: tempSelectedAudio.fileId,
      name: tempSelectedAudio.name,
    });

    // Download waveform data if available
    if (
      tempSelectedAudio.waveformDataFileId &&
      downloadWaveformData &&
      effectIndex !== -1
    ) {
      try {
        const waveformData = await downloadWaveformData(
          tempSelectedAudio.waveformDataFileId,
          httpClient,
        );

        const currentResources = store.getState().fieldResources || {};
        const newFieldResources = {
          ...currentResources,
          [`sfx[${effectIndex}]`]: { waveformData },
        };

        store.setFieldResources(newFieldResources);
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

export const handleTriggerChange = (e, deps) => {
  const { store, render } = deps;
  const id = e.currentTarget.id.replace("trigger-select-", "");

  store.updateSoundEffect({
    id: id,
    trigger: e.target.value,
  });

  render();
};
