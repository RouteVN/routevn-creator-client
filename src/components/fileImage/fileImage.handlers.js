import { toFlatItems } from "../../deps/repository";

const getFileIdFromProps = async (attrs, repositoryFactory, router) => {
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
  const {
    store,
    attrs,
    fileManagerFactory,
    render,
    repositoryFactory,
    router,
  } = deps;

  const fileId = await getFileIdFromProps(attrs, repositoryFactory, router);

  if (!fileId) {
    return;
  }

  try {
    // Get the current project ID from router
    const { p: projectId } = router.getPayload();
    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(projectId);
    // TODO batch file requests
    const { url } = await fileManager.getFileContent({
      fileId: fileId,
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

export const handleOnUpdate = async (_changes, deps) => {
  const {
    store,
    attrs,
    fileManagerFactory,
    render,
    repositoryFactory,
    router,
  } = deps;
  const fileId = await getFileIdFromProps(attrs, repositoryFactory, router);

  if (!fileId) {
    store.setIsLoading(false);
    return;
  }

  try {
    // Get the current project ID from router
    const { p: projectId } = router.getPayload();
    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(projectId);
    // TODO batch file requests
    const { url } = await fileManager.getFileContent({
      fileId: fileId,
    });
    store.setSrc(url);
    render();
  } catch (error) {
    console.error("Failed to load image:", error);
  } finally {
    store.setIsLoading(false);
  }
};
