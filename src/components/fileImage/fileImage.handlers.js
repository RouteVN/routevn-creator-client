export const handleAfterMount = async (deps) => {
  const { store, attrs, httpClient, render } = deps;

  if (!attrs.fileId) {
    return;
  }

  try {
    // TODO batch file requests
    const { url } = await httpClient.creator.getFileContent({
      fileId: attrs.fileId,
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
  const { store, attrs, httpClient, render } = deps;

  try {
    // TODO batch file requests
    const { url } = await httpClient.creator.getFileContent({
      fileId: attrs.fileId,
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
