import { toFlatItems } from "../../repository";

export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { audio } = repository.getState();
  store.setItems({
    items: audio,
  });
};

export const handleOnUpdate = () => {
  
}

export const handleAddNewClick = (e, deps) => {
  e.stopPropagation();
  const { store, render } = deps;
  
  store.addSoundEffect();
  store.setMode({
    mode: 'gallery'
  });
  
  render();
};

export const handleSoundEffectItemClick = (e, deps) => {
  const { store, render } = deps;
  
  const id = e.currentTarget.id.replace('sound-effect-item-', '');
  
  store.setCurrentEditingId({
    id: id
  });
  store.setMode({
    mode: 'gallery'
  });
  
  render();
};

export const handleDeleteClick = (e, deps) => {
  e.stopPropagation();
  const { store, render } = deps;
  
  const id = e.currentTarget.id.replace('delete-button-', '');
  
  store.deleteSoundEffect({
    id: id
  });
  
  render();
};

export const handleAudioItemClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace('audio-item-', '');

  store.setTempSelectedAudioId({
    audioId: id,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  e.stopPropagation();
  
  const { dispatchEvent, store } = deps;
  const soundEffects = store.getState().soundEffects;
  console.log('Sound Effects Submit - soundEffects:', soundEffects);
  
  const filteredEffects = soundEffects.filter(se => se.audioId);
  console.log('Sound Effects Submit - filtered effects:', filteredEffects);
  
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        soundEffects: filteredEffects,
      },
      bubbles: true,
      composed: true
    })
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
  const tempSelectedAudio = toFlatItems(audio).find(audio => audio.id === tempSelectedAudioId);
  
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
  const id = e.currentTarget.id.replace('trigger-select-', '');
  
  store.updateSoundEffect({
    id: id,
    trigger: e.target.value,
  });
  
  render();
};