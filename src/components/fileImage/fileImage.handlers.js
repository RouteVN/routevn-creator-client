const getFileIdFromProps = (attrs, projectService) => {
  if (attrs.fileId && attrs.imageId) {
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

export const handleAfterMount = async (deps) => {
  const { store, props: attrs, projectService, render } = deps;

  await projectService.ensureRepository();
  const fileId = getFileIdFromProps(attrs, projectService);

  if (!fileId) {
    return;
  }

  try {
    const { url } = await projectService.getFileContent(fileId);
    store.setSrc({ src: url });
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
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

  if (!fileId) {
    store.setSrc({ src: "/public/project_logo_placeholder.png" });
    store.setIsLoading({ isLoading: false });
    render();
    return;
  }

  try {
    const { url } = await projectService.getFileContent(fileId);
    store.setSrc({ src: url });
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
  } finally {
    store.setIsLoading({ isLoading: false });
  }
};
