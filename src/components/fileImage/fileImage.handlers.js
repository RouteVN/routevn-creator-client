const getFileIdFromProps = (attrs, projectService) => {
  if (attrs.fileId && attrs.imageId) {
    console.warn("[fileImage] invalid-props", {
      fileId: attrs.fileId,
      imageId: attrs.imageId,
    });
    return;
  }

  if (attrs.fileId) {
    return attrs.fileId;
  }

  if (attrs.imageId) {
    const repositoryState = projectService.getRepositoryState();
    const imageItem = repositoryState?.images?.items?.[attrs.imageId];
    if (!imageItem) {
      throw new Error(`Image with imageId "${attrs.imageId}" not found`);
    }

    const source = attrs.source ?? "original";
    if (source === "thumbnail") {
      return imageItem.thumbnailFileId ?? imageItem.fileId;
    }

    return imageItem.fileId;
  }

  return;
};

const revokeBlobUrl = (src) => {
  if (typeof src !== "string" || !src.startsWith("blob:")) {
    return;
  }

  URL.revokeObjectURL(src);
};

export const handleAfterMount = async (deps) => {
  const { store, props: attrs, projectService, render } = deps;

  await projectService.ensureRepository();
  const fileId = getFileIdFromProps(attrs, projectService);
  const currentSrc = store.selectSrc();

  if (!fileId) {
    store.setLoadedFileId({ fileId: undefined });
    return;
  }

  try {
    const { url } = await projectService.getFileContent(fileId);
    revokeBlobUrl(currentSrc);
    store.setSrc({ src: url });
    store.setLoadedFileId({ fileId });
    render();
  } catch (error) {
    console.error(error);
  } finally {
    store.setIsLoading({ isLoading: false });
    render();
  }
};

export const handleOnUpdate = async (deps, payload) => {
  const { store, projectService, render } = deps;

  await projectService.ensureRepository();
  const { newProps: attrs } = payload;
  const fileId = getFileIdFromProps(attrs, projectService);
  const loadedFileId = store.selectLoadedFileId();
  const currentSrc = store.selectSrc();

  if (fileId && fileId === loadedFileId) {
    return;
  }

  if (!fileId) {
    revokeBlobUrl(currentSrc);
    store.setSrc({ src: "/public/project_logo_placeholder.png" });
    store.setIsLoading({ isLoading: false });
    store.setLoadedFileId({ fileId: undefined });
    render();
    return;
  }

  store.setIsLoading({ isLoading: true });

  try {
    const { url } = await projectService.getFileContent(fileId);
    revokeBlobUrl(currentSrc);
    store.setSrc({ src: url });
    store.setLoadedFileId({ fileId });
    render();
  } catch (error) {
    console.error(error);
  } finally {
    store.setIsLoading({ isLoading: false });
    render();
  }
};
