export const handleOnMount = async (deps) => {
  const { store, attrs, httpClient, render } = deps;
  if (!attrs.fileId) {
    return;
  }

  store.setIsLoading(true);
  
  try {
    // TODO batch file requests
    const { url } = await httpClient.creator.getFileContent({ fileId: attrs.fileId, projectId: 'someprojectId' });
    store.setSrc(url);
    render();
  } catch (error) {
    console.error('Failed to load image:', error);
  } finally {
    store.setIsLoading(false);
  }

  return () => {

  }
};

export const handleOnUpdate = () => {
  console.log('on update')
}