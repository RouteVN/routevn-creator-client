let notificationStore = null;
let notificationRender = null;

export const initNotificationService = (store, render) => {
  notificationStore = store;
  notificationRender = render;
};

export const notification = {
  alert(message, type = "info", title = "") {
    if (!notificationStore || !notificationRender) {
      console.warn(
        "Notification service not initialized, falling back to native alert",
      );
      alert(message);
      return;
    }

    notificationStore.showAlert(message, type, title);
    notificationRender();
  },

  success(message, title = "") {
    this.alert(message, "success", title);
  },

  error(message, title = "") {
    this.alert(message, "error", title);
  },

  warning(message, title = "") {
    this.alert(message, "warning", title);
  },

  info(message, title = "") {
    this.alert(message, "info", title);
  },

  confirm(
    message,
    onConfirm,
    onCancel,
    title = "Confirm",
    confirmText = "Confirm",
    cancelText = "Cancel",
  ) {
    if (!notificationStore || !notificationRender) {
      console.warn(
        "Notification service not initialized, falling back to native confirm",
      );
      const result = window.confirm(message);
      if (result) {
        onConfirm?.();
      } else {
        onCancel?.();
      }
      return;
    }

    notificationStore.showConfirm(
      message,
      onConfirm,
      onCancel,
      title,
      confirmText,
      cancelText,
    );
    notificationRender();
  },

  async confirmAsync(
    message,
    title = "Confirm",
    confirmText = "Confirm",
    cancelText = "Cancel",
  ) {
    return new Promise((resolve) => {
      this.confirm(
        message,
        () => resolve(true),
        () => resolve(false),
        title,
        confirmText,
        cancelText,
      );
    });
  },
};

// Make it globally available
if (typeof window !== "undefined") {
  window.notification = notification;
}
