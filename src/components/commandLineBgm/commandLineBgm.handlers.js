import { toFlatItems } from "../../deps/repository";

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, props, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();

  store.setRepositoryState({
    audio,
  });

  // Initialize with existing BGM data if available
  const audioId = props?.bgm?.audioId;
  if (audioId) {
    store.setSelectedResource({
      resourceId: audioId,
    });
  }

  render();
};

export const handleAudioWaveformRightClick = async (deps, payload) => {
  const { store, render, globalUI } = deps;
  const { _event: event } = payload;
  event.preventDefault();

  const result = await globalUI.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    placement: "bottom-start",
  });

  if (result.item.key === "remove") {
    store.setSelectedResource({
      resourceId: undefined,
    });

    render();
  }
};

export const handleAudioWaveformClick = (deps) => {
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

export const handleFormExtra = (deps, payload) => {
  const { store, render } = deps;
  console.log("BGM form extra event", payload._event.detail);

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

export const handleFormChange = (deps) => {
  const { render } = deps;
  // Handle any form field changes if needed
  render();
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.id.replace(
    "resource-item-",
    "",
  );

  store.setTempSelectedResource({
    resourceId,
  });

  render();
};

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, render, downloadWaveformData, repositoryFactory, router } =
    deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const itemId = payload._event.detail.id;
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

export const handleSubmitClick = (deps, payload) => {
  payload._event.stopPropagation();

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
          audioId: selectedResource?.resourceId,
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBreadcumbActionsClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else {
    store.setMode({
      mode: payload._event.detail.id,
    });
    render();
  }
};

export const handleButtonSelectClick = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
