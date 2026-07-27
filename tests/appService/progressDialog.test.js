import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createProgressDialog } from "../../src/deps/clients/progressDialog.js";

describe("progress dialog client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows non-dismissible progress without an action button", () => {
    const dom = new JSDOM(
      "<!doctype html><html><head></head><body></body></html>",
    );
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);

    const progressDialog = createProgressDialog({
      title: "Windows export in progress",
      message: "Please wait while the executable is being created...",
      status: "Creating executable...",
    });
    const dialog = dom.window.document.getElementById(
      "routevn-progress-dialog",
    );

    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.textContent).toContain("Windows export in progress");
    expect(dialog?.textContent).toContain("Creating executable...");
    expect(dialog?.querySelector("rtgl-button")).toBeNull();

    const closeEvent = new dom.window.Event("close", {
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(closeEvent);
    expect(closeEvent.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute("open")).toBe(true);

    progressDialog.update({ status: "Finishing..." });
    expect(dialog.textContent).toContain("Finishing...");

    progressDialog.close();
    expect(
      dom.window.document.getElementById("routevn-progress-dialog"),
    ).toBeNull();
  });

  it("does not render empty spacing when status copy is omitted", () => {
    const dom = new JSDOM(
      "<!doctype html><html><head></head><body></body></html>",
    );
    const progressDialog = createProgressDialog(
      {
        title: "macOS export in progress",
        message: "Please wait while the application is being created...",
      },
      dom.window.document,
    );
    const dialog = dom.window.document.getElementById(
      "routevn-progress-dialog",
    );
    const content = dialog?.querySelector('[slot="content"]');

    expect(content?.children).toHaveLength(1);

    progressDialog.update({ status: "Finishing..." });
    expect(content?.children).toHaveLength(2);
    progressDialog.update({ status: "" });
    expect(content?.children).toHaveLength(1);
  });

  it("switches from indeterminate to determinate progress", () => {
    const dom = new JSDOM(
      "<!doctype html><html><head></head><body></body></html>",
    );
    const progressDialog = createProgressDialog(
      {
        title: "Bundle in progress",
        message: "Please wait while the bundle is being created...",
        progress: {},
      },
      dom.window.document,
    );
    const progress = dom.window.document.querySelector(
      '[role="progressbar"]',
    );

    expect(progress?.hasAttribute("value")).toBe(false);

    progressDialog.update({
      progress: {
        current: 25,
        total: 100,
      },
    });

    expect(progress?.getAttribute("max")).toBe("100");
    expect(progress?.getAttribute("value")).toBe("25");
    expect(progress?.getAttribute("aria-valuemax")).toBe("100");
    expect(progress?.getAttribute("aria-valuenow")).toBe("25");

    progressDialog.update({ progress: undefined });
    expect(
      dom.window.document.querySelector('[role="progressbar"]'),
    ).toBeNull();
  });

  it("disables the optional action as soon as it is selected", () => {
    const dom = new JSDOM(
      "<!doctype html><html><head></head><body></body></html>",
    );
    const onAction = vi.fn();
    const progressDialog = createProgressDialog(
      {
        title: "Bundle in progress",
        actionLabel: "Cancel",
        onAction,
      },
      dom.window.document,
    );
    const action = dom.window.document.querySelector("rtgl-button");

    action?.dispatchEvent(new dom.window.Event("click"));
    action?.dispatchEvent(new dom.window.Event("click"));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(action?.hasAttribute("disabled")).toBe(true);

    progressDialog.update({ actionDisabled: false });
    expect(action?.hasAttribute("disabled")).toBe(false);
  });
});
