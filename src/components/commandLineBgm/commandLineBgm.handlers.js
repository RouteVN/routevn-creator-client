import { toFlatItems } from "insieme";

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { audio } = projectService.getState();

  store.setRepositoryState({
    audio,
  });

  if (props.bgm) {
    store.setBgm({ bgm: props?.bgm });
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
    store.setBgmAudio({
      audioId: undefined,
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

export const handleFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { _event: event } = payload;
  store.setBgm({
    bgm: {
      audioId: store.selectBgm().audioId,
      ...event.detail.formValues,
    },
  });
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
  const { store, render, downloadWaveformData, projectService } = deps;
  await projectService.ensureRepository();
  const itemId = payload._event.detail.id;
  const { audio } = projectService.getState();

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
  const { dispatchEvent, store } = deps;

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        bgm: store.selectBgm(),
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
  const { store, render, projectService } = deps;
  await projectService.ensureRepository();
  const { audio } = projectService.getState();
  const tempSelectedResourceId = store.selectTempSelectedResourceId();

  if (!tempSelectedResourceId) {
    return;
  }

  const tempSelectedAudio = toFlatItems(audio).find(
    (audio) => audio.id === tempSelectedResourceId,
  );

  if (tempSelectedAudio) {
    store.setBgmAudio({
      audioId: tempSelectedResourceId,
    });

    store.setMode({
      mode: "current",
    });
    render();
  }
};
