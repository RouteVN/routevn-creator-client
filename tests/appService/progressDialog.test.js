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
});
