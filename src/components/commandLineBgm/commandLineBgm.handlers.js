import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { audio } = repository.getState();

  store.setRepositoryState({
    audio,
  });

  // Initialize with existing BGM data if available
  const resourceId = props?.line?.presentation?.bgm?.resourceId;
  if (resourceId) {
    store.setSelectedResource({
      resourceId,
    });
  }
};

export const handleAfterMount = async (deps) => {
  // No longer needed since we use form slot instead of context
};

export const handleAudioWaveformClick = (e, deps) => {
  const { store, render } = deps;

  // When user clicks on waveform, open gallery
  const selectedResource = store.selectSelectedResource();
  if (selectedResource) {
    store.setTempSelectedResource({
      resourceId: selectedResource.resourceId,
    });
  }

  store.setMode({
    mode: "gallery",
  });
  render();
};

export const handleFormExtra = (e, deps) => {
  const { store, render } = deps;
  console.log("BGM form extra event", e.detail);

  // When user clicks on waveform field, open gallery
  const selectedResource = store.selectSelectedResource();
  if (selectedResource) {
    store.setTempSelectedResource({
      resourceId: selectedResource.resourceId,
    });
  }

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

  store.setSelectedResource({
    resourceId: undefined,
  });

  render();
};

export const handleResourceItemClick = (e, deps) => {
  const { store, render } = deps;
  const resourceId = e.currentTarget.id.replace("resource-item-", "");

  store.setTempSelectedResource({
    resourceId,
  });

  render();
};

export const handleFileExplorerItemClick = async (e, deps) => {
  const { store, render, downloadWaveformData, repository } = deps;
  const itemId = e.detail.id;
  const { audio } = repository.getState();

  store.setTempSelectedResource({
    resourceId: itemId,
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
      const waveformData = await downloadWaveformData({
        fileId: selectedItem.waveformDataFileId,
      });

      // This is for preview in gallery mode, not for setting the final selection
      console.log("File explorer - got waveform data:", waveformData);
    } catch (error) {
      console.error("Failed to load waveform data:", error);
    }
  }
};

export const handleSubmitClick = (e, deps) => {
  e.stopPropagation();

  const { dispatchEvent, store, refs } = deps;
  const selectedResource = store.selectSelectedResource();

  // Get form values with fallback
  let formValues = {};
  if (refs && refs.form && typeof refs.form.getValues === "function") {
    formValues = refs.form.getValues();
  }

  console.log("Submit - selectedResource:", selectedResource);
  console.log("Submit - formValues:", formValues);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        bgm: {
          resourceId: selectedResource?.resourceId,
          resourceType: selectedResource?.resourceType,
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

export const handleButtonSelectClick = (e, deps) => {
  const { store, render, repository } = deps;
  const { audio } = repository.getState();
  const tempSelectedResourceId = store.selectTempSelectedResourceId();

  if (!tempSelectedResourceId) {
    return;
  }

  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedResourceId,
  );

  if (tempSelectedAudio) {
    store.setSelectedResource({
      resourceId: tempSelectedResourceId,
    });

    store.setMode({
      mode: "current",
    });
    render();
  }
};
