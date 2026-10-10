import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { installNativeBackOverlays } from "../../src/primitives/nativeBackOverlays.js";

const createDomWindow = () =>
  new JSDOM("<!doctype html><html><body></body></html>").window;

// JSDOM has neither dialog methods nor layout. Give its dialogs the browser's
// open state before the overlays install, as a browser would have them.
const createWindow = () => {
  const window = createDomWindow();
  const dialogPrototype = window.HTMLDialogElement.prototype;
  dialogPrototype.show = function () {
    this.setAttribute("open", "");
  };
  dialogPrototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dialogPrototype.close = function () {
    this.removeAttribute("open");
  };
  return window;
};

const attachShadowHost = (window, parent) => {
  const host = window.document.createElement("div");
  parent.append(host);
  return host.attachShadow({ mode: "open" });
};

// As in `rtgl-dialog` and `rtgl-popover`: the dialog sits in the host's shadow
// root, and its cancel event becomes a close event on the host.
const addRettangoliDialog = (window, parent) => {
  const host = window.document.createElement("div");
  parent.append(host);
  const dialog = window.document.createElement("dialog");
  host.attachShadow({ mode: "open" }).append(dialog);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    host.dispatchEvent(new window.CustomEvent("close", { bubbles: true }));
  });
  const onClose = vi.fn();
  host.addEventListener("close", onClose);
  return { host, dialog, onClose };
};

const addControl = (window, parent, { marked = true, visible = true } = {}) => {
  const control = window.document.createElement("button");
  if (marked) {
    control.setAttribute("data-native-back", "true");
  }
  control.getClientRects = () => (visible ? [{ width: 40, height: 40 }] : []);
  const onClick = vi.fn();
  control.addEventListener("click", onClick);
  parent.append(control);
  return { control, onClick };
};

describe("native back overlays", () => {
  it("closes the dialog that opened last, not the last one in the document", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const page = attachShadowHost(window, window.document.body);
    // The menu comes first in the page but opens from inside the dialog.
    const menu = addRettangoliDialog(window, page);
    const editDialog = addRettangoliDialog(window, page);
    editDialog.dialog.showModal();
    menu.dialog.showModal();

    expect(overlays.closeTopmostDialog()).toBe(true);
    expect(menu.onClose).toHaveBeenCalledTimes(1);
    expect(editDialog.onClose).not.toHaveBeenCalled();
    // The owner's close handler stays in charge of closing it.
    expect(menu.dialog.open).toBe(true);

    menu.dialog.close();
    expect(overlays.closeTopmostDialog()).toBe(true);
    expect(editDialog.onClose).toHaveBeenCalledTimes(1);

    editDialog.dialog.close();
    expect(overlays.closeTopmostDialog()).toBe(false);
    expect(menu.onClose).toHaveBeenCalledTimes(1);
  });

  it("puts a dialog that opens again above the dialogs already open", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const first = addRettangoliDialog(window, window.document.body);
    const second = addRettangoliDialog(window, window.document.body);
    first.dialog.showModal();
    second.dialog.showModal();
    first.dialog.close();
    first.dialog.showModal();

    overlays.closeTopmostDialog();

    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(second.onClose).not.toHaveBeenCalled();
  });

  it("keeps the order when an open dialog is asked to open again", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const below = addRettangoliDialog(window, window.document.body);
    const above = addRettangoliDialog(window, window.document.body);
    below.dialog.showModal();
    above.dialog.showModal();
    below.dialog.showModal();

    overlays.closeTopmostDialog();

    expect(above.onClose).toHaveBeenCalledTimes(1);
    expect(below.onClose).not.toHaveBeenCalled();
  });

  it("consumes Back while the dialog's owner keeps it open", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const progress = addRettangoliDialog(window, window.document.body);
    progress.dialog.showModal();

    expect(overlays.closeTopmostDialog()).toBe(true);
    expect(overlays.closeTopmostDialog()).toBe(true);
    expect(progress.onClose).toHaveBeenCalledTimes(2);
    expect(progress.dialog.open).toBe(true);
  });

  it("closes a dialog that does not prevent its cancel event", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const dialog = window.document.createElement("dialog");
    window.document.body.append(dialog);
    const onCancel = vi.fn();
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();

    expect(overlays.closeTopmostDialog()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });

  it("ignores dialogs that are closed, removed, or shown without a modal", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const closed = addRettangoliDialog(window, window.document.body);
    const removed = addRettangoliDialog(window, window.document.body);
    const nonModal = addRettangoliDialog(window, window.document.body);
    const reshown = addRettangoliDialog(window, window.document.body);
    closed.dialog.showModal();
    closed.dialog.close();
    removed.dialog.showModal();
    removed.host.remove();
    nonModal.dialog.show();
    reshown.dialog.showModal();
    reshown.dialog.close();
    reshown.dialog.show();

    expect(overlays.closeTopmostDialog()).toBe(false);
    for (const { onClose } of [closed, removed, nonModal, reshown]) {
      expect(onClose).not.toHaveBeenCalled();
    }
  });

  it("forgets a dialog as soon as it closes", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const dialog = addRettangoliDialog(window, window.document.body);
    dialog.dialog.showModal();
    dialog.dialog.close();
    // Opened again without a modal by setting the attribute.
    dialog.dialog.setAttribute("open", "");

    expect(overlays.closeTopmostDialog()).toBe(false);
    expect(dialog.onClose).not.toHaveBeenCalled();
  });

  it("taps the last visible marked control across shadow roots", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const page = attachShadowHost(window, window.document.body);
    const explorerClose = addControl(window, page);
    const unrendered = addControl(window, page, { visible: false });
    const unmarked = addControl(window, page, { marked: false });
    const sheetHost = window.document.createElement("div");
    window.document.body.append(sheetHost);
    const sheetOverlay = addControl(
      window,
      sheetHost.attachShadow({ mode: "open" }),
    );

    expect(overlays.closeTopmostPanel()).toBe(true);
    expect(sheetOverlay.onClick).toHaveBeenCalledTimes(1);
    expect(explorerClose.onClick).not.toHaveBeenCalled();

    sheetHost.remove();
    expect(overlays.closeTopmostPanel()).toBe(true);
    expect(explorerClose.onClick).toHaveBeenCalledTimes(1);

    explorerClose.control.remove();
    expect(overlays.closeTopmostPanel()).toBe(false);
    expect(unrendered.onClick).not.toHaveBeenCalled();
    expect(unmarked.onClick).not.toHaveBeenCalled();
  });

  it("installs once per window", () => {
    const window = createWindow();
    const overlays = installNativeBackOverlays(window);
    const { showModal } = window.HTMLDialogElement.prototype;

    expect(installNativeBackOverlays(window)).toBe(overlays);
    expect(window.HTMLDialogElement.prototype.showModal).toBe(showModal);
  });

  it("leaves a DOM without dialog support without dialog methods", () => {
    const window = createDomWindow();
    const overlays = installNativeBackOverlays(window);

    expect(window.HTMLDialogElement.prototype.showModal).toBeUndefined();
    expect(window.HTMLDialogElement.prototype.show).toBeUndefined();
    expect(window.HTMLDialogElement.prototype.close).toBeUndefined();
    expect(overlays.closeTopmostDialog()).toBe(false);
  });
});
