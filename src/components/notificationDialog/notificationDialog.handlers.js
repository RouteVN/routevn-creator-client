import { initNotificationService } from "../../deps/notificationService";

export const handleBeforeMount = (deps) => {
  const { store, render } = deps;
  // Initialize the global notification service with this component's store and render
  initNotificationService(store, render);
};

export const handleDialogClose = (e, deps) => {
  const { store, render } = deps;
  store.closeDialog();
  render();
};

export const handleConfirm = (e, deps) => {
  const { store, render } = deps;
  const config = store.selectConfig();

  if (config.onConfirm) {
    config.onConfirm();
  }

  store.closeDialog();
  render();
};

export const handleCancel = (e, deps) => {
  const { store, render } = deps;
  const config = store.selectConfig();

  if (config.onCancel) {
    config.onCancel();
  }

  store.closeDialog();
  render();
};
