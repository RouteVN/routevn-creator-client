import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { JSDOM } from "jsdom";
import { h } from "snabbdom/build/h.js";
import toHTML from "snabbdom-to-html";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import parse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";

const previewOwners = [
  "pages/images",
  "pages/characterSprites",
  "pages/transforms",
  "pages/animationEditor",
  "components/commandLineBackground",
  "components/commandLineVisual",
  "components/commandLineCharacters",
  "components/commandLineDialogueBox",
  "components/layoutEditPanel",
  "components/layoutEditorPreview",
  "components/layoutEditorSpriteCreateDialog",
  "components/layoutEditorSliderCreateDialog",
];

const readView = (owner) =>
  yaml.load(
    readFileSync(
      new URL(
        `../../src/${owner}/${owner.split("/").at(-1)}.view.yaml`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

const renderPreview = (view, viewData) => {
  // Exercise each owner's actual conditional preview template independently
  // of its unrelated editor forms, data loading, and canvases.
  const template = view.template.filter((node) =>
    JSON.stringify(node).includes("#previewOverlay "),
  );
  expect(template).toHaveLength(1);
  return new JSDOM(
    toHTML(parseView({ h, template: parse(template), viewData })),
  ).window.document;
};

describe.each(previewOwners)("%s fullscreen preview", (owner) => {
  const view = readView(owner);

  it("places the complete preview in the native modal's content slot", () => {
    const document = renderPreview(view, { fullImagePreviewVisible: true });
    const dialog = document.querySelector("rtgl-dialog[open]");
    const overlay = document.querySelector("#previewOverlay");

    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("layout")).toBe("fixed");
    expect(dialog.hasAttribute("bare")).toBe(true);
    expect(dialog.getAttribute("p")).toBe("none");
    expect(overlay.parentElement).toBe(dialog);
    expect(overlay.getAttribute("slot")).toBe("content");
  });

  it("removes the modal when the preview closes", () => {
    const document = renderPreview(view, { fullImagePreviewVisible: false });
    expect(document.querySelector("rtgl-dialog")).toBeNull();
    expect(document.querySelector("#previewOverlay")).toBeNull();
  });

  it("handles native dismissal without bubbling into an underlying editor", () => {
    const close = view.refs.fullPreviewDialog.eventListeners.close;
    expect(close.handler ?? close.action).toBeTruthy();
    expect(close.stopPropagation).toBe(true);
  });
});

it.each(["commandLineBackground", "commandLineVisual"])(
  "%s also elevates spritesheet previews without an image preview",
  (owner) => {
    const document = renderPreview(readView(`components/${owner}`), {
      fullImagePreviewVisible: false,
      fullSpritesheetPreviewVisible: true,
    });
    expect(
      document.querySelector(
        "rtgl-dialog[open] > #previewOverlay rvn-spritesheet-preview",
      ),
    ).toBeTruthy();
  },
);

it("provides an explicit dismissal control for the video playback surface", () => {
  const view = readView("pages/videos");
  const template = view.template.filter((node) =>
    Object.keys(node).some((key) => key.includes("#videoPreviewDialog ")),
  );
  const rendered = parseView({
    h,
    template: parse(template),
    viewData: { videoVisible: true, closePreviewButton: "Close preview" },
  });
  expect(rendered.children[0].data.attrs).toMatchObject({
    id: "videoPreviewDialog",
    open: "",
    layout: "fixed",
    bare: "",
    p: "none",
  });
  const document = new JSDOM(toHTML(rendered)).window.document;
  const closeButton = document.querySelector("#videoPreviewClose");
  expect(closeButton).toBeTruthy();
  expect(closeButton.hasAttribute("sq")).toBe(true);
  expect(closeButton.getAttribute("s") ?? "md").toBe("md");
  expect(closeButton.getAttribute("pre")).toBe("x");
  expect(closeButton.getAttribute("aria-label")).toBe("Close preview");
  expect(view.refs.videoPreviewClose.eventListeners.click.handler).toBe(
    "handleOutsideVideoClick",
  );
});
