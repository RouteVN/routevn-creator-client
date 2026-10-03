import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createProgressDialog } from "../../src/deps/clients/progressDialog.js";

const createDocument = () =>
  new JSDOM("<!doctype html><body></body>").window.document;

const findStatus = (document, text) => {
  return [...document.querySelectorAll("rtgl-text")].find((element) =>
    element.textContent.includes(text),
  );
};

describe("progress dialog status text", () => {
  it("keeps a line break in the status instead of collapsing it", () => {
    const document = createDocument();

    createProgressDialog(
      {
        title: "Importing",
        message: "Please wait",
        status: "Downloading…\n76 MB of 195 MB (39%)",
        progress: {},
      },
      document,
    );

    const status = findStatus(document, "Downloading…");
    expect(status.textContent).toBe("Downloading…\n76 MB of 195 MB (39%)");
    expect(status.getAttribute("style")).toContain("white-space: pre-line");
  });

  it("keeps the line-break style when the status is updated", () => {
    const document = createDocument();
    const dialog = createProgressDialog(
      { title: "Importing", message: "Please wait", progress: {} },
      document,
    );

    dialog.update({ status: "Downloading…\n1 MB of 10 MB (10%)" });
    dialog.update({ status: "Downloading…\n2 MB of 10 MB (20%)" });

    const status = findStatus(document, "Downloading…");
    expect(status.textContent).toBe("Downloading…\n2 MB of 10 MB (20%)");
    expect(status.getAttribute("style")).toContain("white-space: pre-line");
  });
});
