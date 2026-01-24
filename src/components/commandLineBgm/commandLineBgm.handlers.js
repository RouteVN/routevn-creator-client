import { toFlatItems } from "insieme";

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { sounds } = projectService.getState();

  store.setRepositoryState({
    sounds,
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

export const handleFormExtra = (deps, _payload) => {
  const { store, render } = deps;

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
      resourceId: store.selectBgm().resourceId,
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
  const { sounds } = projectService.getState();

  store.setTempSelectedResource({
    resourceId: itemId,
  });
  render();

  // Find the selected sound item
  const flatSoundItems = toFlatItems(sounds);
  const selectedItem = flatSoundItems.find((item) => item.id === itemId);

  // Download waveform data for the selected audio
  if (selectedItem?.waveformDataFileId && downloadWaveformData) {
    try {
      await downloadWaveformData({
        fileId: selectedItem.waveformDataFileId,
      });
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
  const { sounds } = projectService.getState();
  const tempSelectedResourceId = store.selectTempSelectedResourceId();

  if (!tempSelectedResourceId) {
    return;
  }

  const tempSelectedSound = toFlatItems(sounds).find(
    (item) => item.id === tempSelectedResourceId,
  );

  if (tempSelectedSound) {
    store.setBgmAudio({
      resourceId: tempSelectedResourceId,
    });

    store.setMode({
      mode: "current",
    });
    render();
  }
};
