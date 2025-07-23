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

export const handleOnUpdate = () => {};

export const handleAddNewClick = (e, deps) => {
  e.stopPropagation();
  const { store, render } = deps;

  store.addSoundEffect();
  store.setMode({
    mode: "gallery",
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

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};

export const handleBreadcumbSoundEffectsClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "current",
  });
  render();
};

export const handleButtonSelectClickAudio = (payload, deps) => {
  const { store, render, repository } = deps;

  const { audio } = repository.getState();

  const tempSelectedAudioId = store.selectTempSelectedAudioId();
  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedAudioId,
  );

  if (tempSelectedAudio) {
    const currentEditingId = store.getState().currentEditingId;

    store.updateSoundEffect({
      id: currentEditingId,
      audioId: tempSelectedAudioId,
      fileId: tempSelectedAudio.fileId,
      name: tempSelectedAudio.name,
    });

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
