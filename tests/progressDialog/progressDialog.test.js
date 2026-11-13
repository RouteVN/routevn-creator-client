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
  it("turns a line break in the status into a <br> and keeps the accessible text on one line", () => {
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
    const track = document.querySelector("[data-progress-track]");
    expect(track.getAttribute("aria-valuetext")).toBe(
      "Downloading… 76 MB of 195 MB (39%)",
    );
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
});

describe("progress dialog steps", () => {
  const stepRows = (document) =>
    [...document.querySelectorAll("[data-progress-step]")].map((row) => [
      row.textContent,
      row.dataset.progressStep,
      row.querySelector("[data-progress-step-icon]").dataset.progressStepIcon,
      row.getAttribute("aria-current"),
    ]);

  it("lists every step under the title instead of a progress bar", () => {
    const document = createDocument();
    createProgressDialog(
      {
        title: "Exporting",
        message: "Please wait",
        steps: [
          { label: "Step one", state: "done" },
          { label: "Step two", state: "active" },
          { label: "Step three", state: "pending" },
        ],
      },
      document,
    );

    expect(stepRows(document)).toEqual([
      ["Step one", "done", "done", null],
      ["Step two", "active", "active", "step"],
      ["Step three", "pending", "pending", null],
    ]);
    expect(document.querySelector("[data-progress-track]")).toBeNull();
    const list = document.querySelector("[data-progress-steps]");
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe("Exporting");
    // The header comes first, then the steps.
    expect(list.previousElementSibling.textContent).toContain("Exporting");
  });

  it("redraws the steps on update and keeps them above a later status", () => {
    const document = createDocument();
    const dialog = createProgressDialog(
      {
        title: "Exporting",
        steps: [
          { label: "Step one", state: "active" },
          { label: "Step two", state: "pending" },
        ],
      },
      document,
    );
    dialog.update({ status: "Almost done" });
    dialog.update({
      steps: [
        { label: "Step one", state: "done" },
        { label: "Step two", state: "active" },
      ],
    });

    expect(stepRows(document)).toEqual([
      ["Step one", "done", "done", null],
      ["Step two", "active", "active", "step"],
    ]);
    expect(document.querySelectorAll("[data-progress-steps]")).toHaveLength(1);
    const list = document.querySelector("[data-progress-steps]");
    expect(list.nextElementSibling.textContent).toBe("Almost done");
  });

  it("changes only the running step's numbers, so its spinner keeps turning", () => {
    const document = createDocument();
    const steps = (detail) => [
      { label: "Step one", state: "done" },
      { label: "Step two", state: "active", detail },
    ];
    const dialog = createProgressDialog(
      { title: "Exporting", steps: steps("1 / 423") },
      document,
    );
    const spinner = document.querySelector(
      '[data-progress-step-icon="active"]',
    );
    const detail = () =>
      [...document.querySelectorAll("[data-progress-step-detail]")].map(
        (element) => element.textContent,
      );
    expect(detail()).toEqual(["", "1 / 423"]);

    dialog.update({ steps: steps("12 / 423") });
    expect(detail()).toEqual(["", "12 / 423"]);
    expect(document.querySelector('[data-progress-step-icon="active"]')).toBe(
      spinner,
    );

    dialog.update({ steps: steps(undefined) });
    expect(detail()).toEqual(["", ""]);
  });
});
