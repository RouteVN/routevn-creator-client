// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createComponent } from "@rettangoli/fe";
import yaml from "js-yaml";
import { parse } from "jempl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/components/resource-import-preview-media/resource-import-preview-media.handlers.js";
import * as store from "../../src/components/resource-import-preview-media/resource-import-preview-media.store.js";

const readYaml = (path) =>
  yaml.load(readFileSync(new URL(path, import.meta.url), "utf8"));

const view = readYaml(
  "../../src/components/resource-import-preview-media/resource-import-preview-media.view.yaml",
);
view.template = parse(view.template);
const schema = readYaml(
  "../../src/components/resource-import-preview-media/resource-import-preview-media.schema.yaml",
);

const projectService = { cancelResourceImport() {} };
const audioService = { stop: vi.fn() };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    replaceSync() {}
  };
  URL.createObjectURL = vi.fn(() => "blob:sound");
  URL.revokeObjectURL = vi.fn();
  customElements.define(
    "rvn-resource-import-preview-media-render-test",
    createComponent(
      { handlers, schema, store, view },
      { projectService, audioService },
    ),
  );
});

afterEach(() => {
  delete projectService.loadResourceImportPreview;
});

describe("resource-import-preview-media rendering", () => {
  it("plays a sound in the audio player, and stops it when removed", async () => {
    projectService.loadResourceImportPreview = vi.fn(async () => ({
      valid: true,
      preview: {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/mpeg",
        kind: "audio",
      },
    }));
    const media = document.createElement(
      "rvn-resource-import-preview-media-render-test",
    );
    media.setAttribute("planId", "plan-1");
    media.setAttribute("sourceFileId", "file-sound");
    media.setAttribute("label", "Theme");
    document.body.append(media);
    await settle();

    const player = media.shadowRoot.querySelector("rvn-audio-player");
    expect(player.getAttribute("src")).toBe("blob:sound");
    expect(player.getAttribute("autoPlay")).toBe("true");
    expect(player.closest("[data-preview-controls]")).not.toBeNull();
    expect(media.shadowRoot.querySelector("img")).toBeNull();

    media.remove();
    expect(audioService.stop).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:sound");
  });

  it("shows a still image on the Images page's transparency grid", async () => {
    projectService.loadResourceImportPreview = vi.fn(async () => ({
      valid: true,
      preview: {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        kind: "image",
      },
    }));
    const media = document.createElement(
      "rvn-resource-import-preview-media-render-test",
    );
    media.setAttribute("planId", "plan-1");
    media.setAttribute("sourceFileId", "file-image");
    media.setAttribute("label", "Forest");
    document.body.append(media);
    await settle();

    const image = media.shadowRoot.querySelector("img");
    expect(image.classList.contains("previewTransparencyGrid")).toBe(true);
    expect(image.getAttribute("style")).toBeNull();
    expect(view.styles[".previewTransparencyGrid"]).toMatchObject({
      "background-color": "#eef2f7",
      "background-size": "12px 12px",
    });

    media.remove();
  });
});
