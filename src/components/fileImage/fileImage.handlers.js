import { toFlatItems } from "#v2-tree-helpers";

const getFileIdFromProps = (attrs, projectService) => {
  // Validate that both fileId and imageId are not passed
  if (attrs.fileId && attrs.imageId) {
    return;
  }

  // If fileId is provided, use it directly
  if (attrs.fileId) {
    return attrs.fileId;
  }

  // If imageId is provided, convert it to fileId
  if (attrs.imageId) {
    const state = projectService.getState();
    const { images } = state;
    const flatImageItems = toFlatItems(images);
    const existingImage = flatImageItems.find(
      (item) => item.id === attrs.imageId,
    );

    if (existingImage) {
      return existingImage.fileId;
    }

    throw new Error(`Image with imageId "${attrs.imageId}" not found`);
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
