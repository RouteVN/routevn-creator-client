import { toFlatItems } from "insieme";

const getFileIdFromProps = async (attrs, projectService) => {
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
    const state = await projectService.getState();
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
  const { store, attrs, projectService, render } = deps;

  const fileId = await getFileIdFromProps(attrs, projectService);

  if (!fileId) {
    return;
  }

  try {
    const { url } = await projectService.getFileContent(fileId);
    store.setSrc(url);
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
  } finally {
    store.setIsLoading(false);
    render();
  }
};

export const handleOnUpdate = async (deps, payload) => {
  const { store, projectService, render } = deps;

  const { newAttrs: attrs } = payload;
  const fileId = await getFileIdFromProps(attrs, projectService);

  if (!fileId) {
    store.setSrc("/public/project_logo_placeholder.png");
    store.setIsLoading(false);
    render();
    return;
  }

  try {
    const { url } = await projectService.getFileContent(fileId);
    store.setSrc(url);
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
  } finally {
    store.setIsLoading(false);
  }
};
