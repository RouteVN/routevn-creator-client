import { toFlatItems } from "../../deps/repository";

const getFileIdFromProps = (attrs, repository) => {
  // Validate that both fileId and imageId are not passed
  if (attrs.fileId && attrs.imageId) {
    throw new Error(
      "Cannot pass both fileId and imageId props to fileImage component",
    );
  }

  // If fileId is provided, use it directly
  if (attrs.fileId) {
    return attrs.fileId;
  }

  // If imageId is provided, convert it to fileId
  if (attrs.imageId) {
    const { images } = repository.getState();
    const flatImageItems = toFlatItems(images);
    const existingImage = flatImageItems.find(
      (item) => item.id === attrs.imageId,
    );

    if (existingImage) {
      return existingImage.fileId;
    }

    throw new Error(`Image with imageId "${attrs.imageId}" not found`);
  }

  return null;
};

export const handleAfterMount = async (deps) => {
  const { store, attrs, httpClient, render, repository } = deps;

  const fileId = getFileIdFromProps(attrs, repository);

  if (!fileId) {
    return;
  }

  try {
    // TODO batch file requests
    const { url } = await httpClient.creator.getFileContent({
      fileId: fileId,
      projectId: "someprojectId",
    });
    store.setSrc(url);
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
  } finally {
    store.setIsLoading(false);
    render();
  }
};

export const handleOnUpdate = async (changes, deps) => {
  const { store, attrs, httpClient, render, repository } = deps;

  const fileId = getFileIdFromProps(attrs, repository);

  if (!fileId) {
    store.setIsLoading(false);
    return;
  }

  try {
    // TODO batch file requests
    const { url } = await httpClient.creator.getFileContent({
      fileId: fileId,
      projectId: "someprojectId",
    });
    store.setSrc(url);
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
  } finally {
    store.setIsLoading(false);
  }
};
