import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, render, props } = deps;
  const { audio } = repository.getState();
  store.setItems({
    items: audio,
  });

  // Initialize with existing BGM data if available
  if (props?.line?.presentation?.bgm?.audioId) {
    const flatAudioItems = toFlatItems(audio);
    const existingAudio = flatAudioItems.find(
      (item) => item.id === props.line.presentation.bgm.audioId,
    );

    if (existingAudio) {
      store.setSelectedAudioAndFileId({
        audioId: props.line.presentation.bgm.audioId,
        fileId: existingAudio.fileId,
      });
    }
  }
};

export const handleOnUpdate = () => {};

export const handleAudioItemClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace("audio-item-", "");

  store.setTempSelectedAudioId({
    audioId: id,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  e.stopPropagation(); // Prevent double firing

  const { dispatchEvent, store } = deps;
  const selectedAudioId = store.selectSelectedAudioId();

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        bgm: {
          audioId: selectedAudioId,
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAudioSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  const selectedAudioId = store.selectSelectedAudioId();

  store.setTempSelectedAudioId({
    audioId: selectedAudioId,
  });

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else {
    store.setMode({
      mode: e.detail.id,
    });
    render();
  }
};

export const handleButtonSelectClickAudio = (payload, deps) => {
  const { store, render, repository } = deps;

  const { audio } = repository.getState();

  const tempSelectedAudioId = store.selectTempSelectedAudioId();
  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedAudioId,
  );

  if (tempSelectedAudio) {
    store.setSelectedAudioAndFileId({
      audioId: tempSelectedAudioId,
      fileId: tempSelectedAudio.fileId,
    });
    store.setMode({
      mode: "current",
    });
    render();
  }
};
