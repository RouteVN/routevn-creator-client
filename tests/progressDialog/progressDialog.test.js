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

const lines = (element) => {
  const result = [""];
  for (const node of element.childNodes) {
    if (node.nodeName === "BR") {
      result.push("");
    } else {
      result[result.length - 1] += node.textContent;
    }
  }
  return result;
};

describe("progress dialog status text", () => {
  it("turns a line break in the status into a <br> so it renders the same everywhere", () => {
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
    expect(status.querySelectorAll("br")).toHaveLength(1);
    expect(lines(status)).toEqual(["Downloading…", "76 MB of 195 MB (39%)"]);
  });

  it("keeps a single-line status as plain text", () => {
    const document = createDocument();

    createProgressDialog(
      {
        title: "Importing",
        message: "Please wait",
        status: "Extracting files… 83%",
        progress: {},
      },
      document,
    );

    const status = findStatus(document, "Extracting");
    expect(status.querySelectorAll("br")).toHaveLength(0);
    expect(status.textContent).toBe("Extracting files… 83%");
  });

  it("rebuilds the lines on every update without leaving old breaks behind", () => {
    const document = createDocument();
    const dialog = createProgressDialog(
      { title: "Importing", message: "Please wait", progress: {} },
      document,
    );

    dialog.update({ status: "Downloading…\n1 MB of 10 MB (10%)" });
    dialog.update({ status: "Downloading…\n2 MB of 10 MB (20%)" });
    dialog.update({ status: "Finishing up…" });

    const status = findStatus(document, "Finishing up");
    expect(status.querySelectorAll("br")).toHaveLength(0);
    expect(lines(status)).toEqual(["Finishing up…"]);
  });

  it("describes the status to assistive technology on one line", () => {
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

    const track = document.querySelector("[data-progress-track]");
    expect(track.getAttribute("aria-valuetext")).toBe(
      "Downloading… 76 MB of 195 MB (39%)",
    );
  });
});
