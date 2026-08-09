export const handleBeforeMount = (deps) => {
  const { projectService, store, uiConfig } = deps;

  store.setUiConfig({ uiConfig });
  store.setImagesData({
    imagesData: projectService.getRepositoryState()?.images,
  });
};

export const handleCreatePackageButtonClick = (deps) => {
  const { render, store } = deps;
  store.openCreatePackageDialog();
  render();
};

export const handleCreatePackageDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeCreatePackageDialog();
  render();
};

export const handleAddPackageResourceButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openResourceTypeMenu({ x: rect.left, y: rect.bottom });
  render();
};

export const handleResourceTypeMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeResourceTypeMenu();
  render();
};

export const handleResourceTypeMenuItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { item } = payload._event.detail;
  store.closeResourceTypeMenu();

  store.openFolderNameDialog({ type: item.value });

  render();
};

export const handleFolderNameDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeFolderNameDialog();
  render();
};

export const handleFolderNameFormAction = (deps, payload) => {
  const { render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const type = store.selectFolderNameDialogType();
  store.addResourceSection({ type, name: values.name });
  store.closeFolderNameDialog();
  render();
};

export const handleAddSectionImageButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const { sectionId } = payload._event.currentTarget.dataset;
  store.openImageSelectorDialog({ sectionId });
  render();
};

export const handleImageSelected = (deps, payload) => {
  const { render, store } = deps;
  const { imageId } = payload._event.detail;
  store.setImageSelectorSelectedImageId({ imageId });
  render();
};

export const handleImageSelectorCancel = (deps) => {
  const { render, store } = deps;
  store.closeImageSelectorDialog();
  render();
};

export const handleImageSelectorSubmit = (deps) => {
  const { render, store } = deps;
  const { sectionId, selectedImageId } = store.selectImageSelectorDialog();
  store.addSelectedImage({ sectionId, imageId: selectedImageId });
  store.closeImageSelectorDialog();
  render();
};

export const handleFileExplorerClickItem = (deps, payload) => {
  const { refs } = deps;
  const { itemId } = payload._event.detail;
  refs.imageSelector.transformedHandlers.handleScrollToItem({ itemId });
};
