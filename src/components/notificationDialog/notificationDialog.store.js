export const INITIAL_STATE = Object.freeze({
  isOpen: false,

  config: {
    type: "info", // info | success | error | warning | confirm
    title: "",
    message: "",
    confirmText: "OK",
    cancelText: "Cancel",
    onConfirm: null,
    onCancel: null,
  },
});

export const getDefaultTitle = (type) => {
  const titles = {
    info: "Information",
    success: "Success",
    error: "Error",
    warning: "Warning",
    confirm: "Confirm",
  };
  return titles[type] || "Notification";
};

export const showAlert = (state, message, type = "info", title = "") => {
  state.config = {
    type,
    title: title || getDefaultTitle(type),
    message,
    confirmText: "OK",
    cancelText: "Cancel",
    onConfirm: null,
    onCancel: null,
  };
  state.isOpen = true;
};

export const showSuccess = (state, message, title = "") => {
  showAlert(state, message, "success", title);
};

export const showError = (state, message, title = "") => {
  showAlert(state, message, "error", title);
};

export const showWarning = (state, message, title = "") => {
  showAlert(state, message, "warning", title);
};

export const showInfo = (state, message, title = "") => {
  showAlert(state, message, "info", title);
};

export const showConfirm = (
  state,
  message,
  onConfirm,
  onCancel,
  title = "Confirm",
  confirmText = "Confirm",
  cancelText = "Cancel",
) => {
  state.config = {
    type: "confirm",
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
  };
  state.isOpen = true;
};

export const closeDialog = (state) => {
  state.isOpen = false;
  state.config.onConfirm = null;
  state.config.onCancel = null;
};

export const selectConfig = ({ state }) => state.config;
export const selectIsOpen = ({ state }) => state.isOpen;

export const toViewData = ({ state }) => {
  return {
    isOpen: state.isOpen,
    config: state.config,
  };
};
