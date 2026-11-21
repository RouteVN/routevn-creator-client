export const createAssetLoadSessionGuard = ({
  projectService,
  canvas,
  isCacheCurrent = () => true,
}) => {
  const projectId = projectService.getEnsuredProjectId();
  return () =>
    Boolean(projectId) &&
    projectService.getEnsuredProjectId() === projectId &&
    (!canvas || canvas.isConnected) &&
    isCacheCurrent();
};
