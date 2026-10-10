// The system Back of the mobile apps closes the topmost open overlay, one at a
// time, as Escape does on desktop.
//
// Modal dialogs, popovers and menus open in the browser's top layer, whose
// order is the order they opened in, not document order, and the browser does
// not expose it. The order is therefore recorded as dialogs open.
//
// Sheets and full-page panels are ordinary page elements. A control marked
// with `data-native-back="true"` takes Back for its panel, as a tap on it would.
const NATIVE_BACK_ATTRIBUTE = "data-native-back";

const installations = new WeakMap();

const collectNativeBackControls = (root, controls) => {
  for (const element of root.children) {
    if (element.getAttribute(NATIVE_BACK_ATTRIBUTE) === "true") {
      controls.push(element);
    }
    if (element.shadowRoot) {
      collectNativeBackControls(element.shadowRoot, controls);
    }
    collectNativeBackControls(element, controls);
  }
  return controls;
};

export const installNativeBackOverlays = (windowTarget = window) => {
  if (installations.has(windowTarget)) {
    return installations.get(windowTarget);
  }

  // Open modal dialogs, oldest first. Rettangoli closes its dialogs with
  // close(), also when they leave the page, so they leave the set at once.
  // Dialogs closed or removed another way leave it at the next open or Back.
  const modalDialogs = new Set();
  const dialogPrototype = windowTarget.HTMLDialogElement.prototype;
  const { show, showModal, close } = dialogPrototype;

  const forgetClosedDialogs = () => {
    for (const dialog of modalDialogs) {
      if (!dialog.open || !dialog.isConnected) {
        modalDialogs.delete(dialog);
      }
    }
  };

  // A DOM without dialog support, such as a test DOM, keeps it missing.
  if (typeof showModal === "function") {
    dialogPrototype.showModal = function (...args) {
      const wasOpen = this.open;
      const result = showModal.apply(this, args);
      if (!wasOpen) {
        forgetClosedDialogs();
        modalDialogs.delete(this);
        modalDialogs.add(this);
      }
      return result;
    };
  }

  // A dialog shown without a modal stays out of the top layer, and Escape
  // leaves it open.
  if (typeof show === "function") {
    dialogPrototype.show = function (...args) {
      const result = show.apply(this, args);
      modalDialogs.delete(this);
      return result;
    };
  }

  if (typeof close === "function") {
    dialogPrototype.close = function (...args) {
      const result = close.apply(this, args);
      modalDialogs.delete(this);
      return result;
    };
  }

  const overlays = {
    // Rettangoli dialogs, popovers and menus turn the cancel event that Escape
    // fires into the close event their owners handle. A dialog that does not
    // prevent it closes, as the browser closes it after Escape.
    closeTopmostDialog() {
      forgetClosedDialogs();
      const dialog = [...modalDialogs].at(-1);
      if (!dialog) {
        return false;
      }

      const cancelEvent = new windowTarget.Event("cancel", {
        cancelable: true,
      });
      if (dialog.dispatchEvent(cancelEvent)) {
        dialog.close();
      }
      return true;
    },

    // Later panels in the document are drawn above earlier ones.
    closeTopmostPanel() {
      const control = collectNativeBackControls(
        windowTarget.document,
        [],
      ).findLast((element) => element.getClientRects().length > 0);
      if (!control) {
        return false;
      }

      control.click();
      return true;
    },
  };

  installations.set(windowTarget, overlays);
  return overlays;
};
