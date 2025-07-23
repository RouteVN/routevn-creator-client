import { toTreeStructure } from "../../deps/repository";
import {
  extractFileIdsFromRenderState,
  layoutTreeStructureToRenderState,
} from "../../utils/index.js";

const renderLayoutPreview = async (deps) => {
  const { store, repository, render, drenderer, httpClient } = deps;
  const layoutId = store.selectLayoutId();

  const {
    layouts,
    images: { items: imageItems },
  } = repository.getState();
  const layout = layouts.items[layoutId];

  const layoutTreeStructure = toTreeStructure(layout.elements);
  const renderStateElements = layoutTreeStructureToRenderState(
    layoutTreeStructure,
    imageItems,
  );

  store.setItems(layout?.elements || { items: {}, tree: [] });
  render();

  const selectedItem = store.selectSelectedItem();

  const fileIds = extractFileIdsFromRenderState(renderStateElements);

  const assets = {};

  for (const fileId of fileIds) {
    const { url } = await httpClient.creator.getFileContent({
      fileId: fileId,
      projectId: "someprojectId",
    });
    assets[`file:${fileId}`] = {
      url: url,
      type: "image/png",
    };
  }

  await drenderer.loadAssets(assets);

  const elements = selectedItem
    ? renderStateElements.concat([
        {
          id: "id1",
          type: "rect",
          x: selectedItem.x - 5,
          y: selectedItem.y - 5,
          width: 11,
          height: 11,
          fill: "red",
        },
      ])
    : renderStateElements;

  drenderer.render({
    elements,
    transitions: [],
  });
};

export const handleBeforeMount = (deps) => {
  const { router, store, repository } = deps;
  const { layoutId } = router.getPayload();
  const { layouts, images } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayoutId(layoutId);
  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
};

export const handleAfterMount = async (deps) => {
  const { render, getRefIds, drenderer } = deps;
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });
  await renderLayoutPreview(deps);
  render();
};

export const handleTargetChanged = (payload, deps) => {
  const { render } = deps;
  render();
};

export const handleFileExplorerItemClick = async (e, deps) => {
  const { store, render } = deps;
  const itemId = e.detail.id;
  store.setSelectedItemId(itemId);
  render();
  await renderLayoutPreview(deps);
};

export const handleAddLayoutClick = (e, deps) => {
  const { render } = deps;
  render();
};

export const handleDataChanged = async (e, deps) => {
  const { router, store, repository, render } = deps;
  const { layoutId } = router.getPayload();
  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setItems(layout?.elements || { items: {}, tree: [] });
  render();
  await renderLayoutPreview(deps);
};

export const handleDetailPanelItemUpdate = async (e, deps) => {
  const { repository, store } = deps;
  const layoutId = store.selectLayoutId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  await renderLayoutPreview(deps);
};

export const handleRequestImageGroups = (e, deps) => {
  const { getRefIds, store } = deps;
  const { fieldIndex, currentValue } = e.detail;

  // Get groups from transformed repository data
  const viewData = store.toViewData();
  const groups = viewData.imageGroups;

  // Show dialog with groups using correct ref access pattern
  const refIds = getRefIds();
  const detailPanelRef = refIds["detail-panel"];

  if (detailPanelRef && detailPanelRef.elm && detailPanelRef.elm.store) {
    detailPanelRef.elm.store.showImageSelectorDialog({
      fieldIndex,
      groups,
      currentValue,
    });
    detailPanelRef.elm.render();
  }
};

export const handleImageSelectorUpdated = async (e, deps) => {
  const { repository, store, render } = deps;
  const { imageId } = e.detail;
  const layoutId = store.selectLayoutId();

  // Update the selected item with the new imageId
  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: { imageId },
    },
  });

  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setItems(layout?.elements || { items: {}, tree: [] });
  render();
  await renderLayoutPreview(deps);
};
