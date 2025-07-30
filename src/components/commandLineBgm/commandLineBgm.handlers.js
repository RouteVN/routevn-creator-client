import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { audio } = repository.getState();
  store.setItems({
    items: audio,
  });

  // Initialize with existing BGM data if available (sync part only)
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

export const handleAfterMount = async (deps) => {
  const { repository, store, render, props, downloadWaveformData, httpClient } =
    deps;
  const { audio } = repository.getState();

  // Load waveform data for existing BGM if available
  if (props?.line?.presentation?.bgm?.audioId) {
    const flatAudioItems = toFlatItems(audio);
    const existingAudio = flatAudioItems.find(
      (item) => item.id === props.line.presentation.bgm.audioId,
    );

    if (existingAudio?.waveformDataFileId && downloadWaveformData) {
      console.log(
        "After mount - downloading waveform data for:",
        existingAudio.waveformDataFileId,
      );

      try {
        const waveformData = await downloadWaveformData(
          existingAudio.waveformDataFileId,
          httpClient,
        );

        store.setContext({
          audio: {
            waveformData,
          },
        });
        render();
      } catch (error) {
        console.error("Failed to load waveform data:", error);
      }
    }
  }
};

export const handleOnUpdate = () => {};

export const handleFormExtra = (e, deps) => {
  const { store, render } = deps;
  console.log("BGM form extra event", e.detail);

  // When user clicks on waveform field, open gallery
  const selectedAudioId = store.selectSelectedAudioId();
  store.setTempSelectedAudioId({
    audioId: selectedAudioId,
  });

  store.setMode({
    mode: "gallery",
  });
  render();
};

export const handleFormChange = (e, deps) => {
  const { store, render } = deps;
  // Handle any form field changes if needed
  render();
};

export const handleResetClick = (e, deps) => {
  const { store, render } = deps;

  store.setSelectedAudioAndFileId({
    audioId: undefined,
    fileId: undefined,
  });

  store.setContext({
    audio: {
      waveformData: undefined,
    },
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

export const handleFileExplorerItemClick = async (e, deps) => {
  const { store, render, downloadWaveformData, httpClient, repository } = deps;
  const itemId = e.detail.id;
  const { audio } = repository.getState();

  store.setTempSelectedAudioId({
    audioId: itemId,
  });
  render();

  // Find the selected audio item
  const flatAudioItems = toFlatItems(audio);
  const selectedItem = flatAudioItems.find((item) => item.id === itemId);

  console.log("File explorer - selectedItem:", selectedItem);

  // Download waveform data for the selected audio
  if (selectedItem?.waveformDataFileId && downloadWaveformData) {
    console.log(
      "File explorer - downloading waveform data for:",
      selectedItem.waveformDataFileId,
    );

    try {
      const waveformData = await downloadWaveformData(
        selectedItem.waveformDataFileId,
        httpClient,
      );

      // This is for preview in gallery mode, not for setting the final selection
      console.log("File explorer - got waveform data:", waveformData);
    } catch (error) {
      console.error("Failed to load waveform data:", error);
    }
  }
};

export const handleSubmitClick = (e, deps) => {
  e.stopPropagation(); // Prevent double firing

  const { dispatchEvent, store, refs } = deps;
  const selectedAudioId = store.selectSelectedAudioId();

  // Get form values with fallback
  let formValues = {};
  if (refs && refs.form && typeof refs.form.getValues === "function") {
    formValues = refs.form.getValues();
  }

  console.log("Submit - selectedAudioId:", selectedAudioId);
  console.log("Submit - formValues:", formValues);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        bgm: {
          audioId: selectedAudioId,
          loopType: formValues.loopType || "none",
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
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

export const handleButtonSelectClickAudio = async (payload, deps) => {
  const { store, render, repository, downloadWaveformData, httpClient } = deps;

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

    // Download waveform data for the selected audio
    if (tempSelectedAudio.waveformDataFileId && downloadWaveformData) {
      const waveformData = await downloadWaveformData(
        tempSelectedAudio.waveformDataFileId,
        httpClient,
      );

      // Update context with waveform data
      store.setContext({
        audio: {
          waveformData,
        },
      });
    }

    store.setMode({
      mode: "current",
    });
    render();
  }
};
