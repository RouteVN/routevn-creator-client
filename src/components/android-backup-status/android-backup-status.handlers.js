export const handleBeforeMount = (deps) => {
  const { appService, store, render } = deps;
  const subscription = appService.subscribeBackup((status) => {
    store.setStatus({
      status,
      currentProjectId: appService.getCurrentProjectId(),
    });
    render();
  });
  void appService.refreshBackupStatus();
  return () => subscription.unsubscribe();
};
export const handleSetup = ({ appService }) => {
  appService.navigate("/project-folder-setup", { from: "config" });
};
