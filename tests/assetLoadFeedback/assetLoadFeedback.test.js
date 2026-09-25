import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import {
  getAssetLoadFailures,
  showAssetLoadFailures,
} from "../../src/internal/ui/assetLoadFeedback.js";

const graphicsError = (fileId) =>
  Object.assign(new Error("decoder details must stay out of the UI"), {
    details: { assetKey: fileId },
  });

const createDeps = (repository = {}, i18n) => ({
  appService: { showAlert: vi.fn() },
  projectService: { getRepositoryState: () => repository },
  i18n,
});

const message = (deps) => deps.appService.showAlert.mock.calls[0][0].message;

describe("asset load feedback", () => {
  it("names only failed assets from nested graphics errors and prefers authoring names", () => {
    const deps = createDeps({
      images: { items: { image: { name: "Image One", fileId: "image-file" } } },
      videos: { items: { video: { name: "Video One", fileId: "video-file" } } },
    });
    const error = new AggregateError([
      graphicsError("image-file"),
      new AggregateError([
        graphicsError("video-file"),
        graphicsError("image-file"),
      ]),
    ]);
    showAssetLoadFailures(deps, getAssetLoadFailures(error), {
      images: {
        image: { fileId: "image-file" },
        good: { name: "Good Image", fileId: "good-file" },
      },
    });
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(message(deps)).toContain("Images: Image One");
    expect(message(deps)).toContain("Videos: Video One");
    expect(message(deps).match(/Image One/g)).toHaveLength(1);
    expect(message(deps)).not.toContain("Good Image");
    expect(message(deps)).not.toContain("decoder details");
    expect(message(deps)).toContain(
      "\n• Images: Image One\n• Videos: Video One\n\n",
    );
  });

  it("identifies character sprites, voices, and unresolved file IDs", () => {
    const deps = createDeps({
      characters: {
        items: {
          character: {
            name: "Character One",
            sprites: {
              items: { sprite: { name: "Pose One", fileId: "sprite-file" } },
            },
          },
        },
      },
      voices: { items: { voice: { name: "Voice One", fileId: "voice-file" } } },
    });
    showAssetLoadFailures(
      deps,
      ["sprite-file", "voice-file", "missing-file"].map((fileId) => ({
        fileId,
        error: new Error(),
      })),
    );
    expect(message(deps)).toContain("Characters: Character One / Pose One");
    expect(message(deps)).toContain("Voices: Voice One");
    expect(message(deps)).toContain("Asset file: missing-file");
  });

  it("lists damaged fonts alongside images with one recovery message", () => {
    const deps = createDeps({
      fonts: { items: { font: { name: "Font One", fileId: "font-file" } } },
      images: { items: { image: { name: "Image One", fileId: "image-file" } } },
    });
    const error = Object.assign(new Error(), {
      fileId: "font-file",
      code: "font_integrity_mismatch",
    });
    showAssetLoadFailures(
      deps,
      getAssetLoadFailures(
        new AggregateError([error, graphicsError("image-file"), error]),
      ),
    );
    expect(message(deps)).toBe(
      "Could not load these assets:\n• Fonts: Font One\n• Images: Image One\n\nCheck their files and replace them with valid copies if needed.",
    );
  });

  it("does not guess a file when the error has no identity", () => {
    const deps = createDeps();
    showAssetLoadFailures(deps, getAssetLoadFailures(new Error("unknown")));
    expect(message(deps)).toContain("An unidentified asset");
  });

  it.each(["en", "ja", "zh-hans"])(
    "uses the %s catalog for file and resource labels",
    (locale) => {
      const i18n = yaml.load(readFileSync(`src/i18n/${locale}.yaml`, "utf8"));
      const deps = createDeps({}, i18n);
      showAssetLoadFailures(
        deps,
        [
          { fileId: "image-file" },
          { fileId: "font-file" },
          { fileId: "unknown-file" },
        ],
        {
          images: { image: { name: "Image One", fileId: "image-file" } },
          fonts: { font: { fontFamily: "Font One", fileId: "font-file" } },
        },
        { previewBlocked: true },
      );
      expect(message(deps)).toContain(i18n.assetLoadFeedback.previewBlocked);
      expect(message(deps)).toContain(
        `${i18n.resourceTypes.images}: Image One`,
      );
      expect(message(deps)).toContain(`${i18n.resourceTypes.fonts}: Font One`);
      expect(message(deps)).toContain(
        i18n.assetLoadFeedback.file.replace("{fileId}", "unknown-file"),
      );
      expect(message(deps)).not.toContain("{assets}");
    },
  );
});
