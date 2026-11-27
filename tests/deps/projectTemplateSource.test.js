import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyProjectTemplateFiles,
  loadProjectTemplate,
} from "../../src/deps/clients/web/projectTemplateSource.js";

const bytes = (text) => new TextEncoder().encode(text);

const downloadedTemplate = () => ({
  id: "Tp1TemplateOne01",
  repository: {
    project: { resolution: { width: 1280, height: 720 } },
    files: {
      items: {
        imageOne: { id: "imageOne", mimeType: "image/png" },
      },
      tree: [{ id: "imageOne" }],
    },
  },
  files: [{ fileId: "imageOne", mimeType: "image/png", bytes: bytes("one") }],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project template source", () => {
  it("creates from a downloaded store template at its own resolution, with its own files", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const template = downloadedTemplate();

    const { templateData, files } = await loadProjectTemplate({
      template,
      language: "ja",
      projectResolution: { width: 1920, height: 1080 },
    });

    expect(templateData).toEqual(template.repository);
    expect(templateData).not.toBe(template.repository);
    expect(files.map(({ fileId, mimeType }) => ({ fileId, mimeType }))).toEqual(
      [{ fileId: "imageOne", mimeType: "image/png" }],
    );
    expect(await files[0].read()).toEqual(bytes("one"));
    // Nothing is fetched from the bundled templates.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves every file it can read, and skips one it cannot", async () => {
    const saveFile = vi.fn(async () => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await copyProjectTemplateFiles({
      files: [
        {
          fileId: "missing",
          mimeType: "image/png",
          read: async () => {
            throw new Error("Template file missing answered 404.");
          },
        },
        {
          fileId: "imageOne",
          mimeType: "image/png",
          read: async () => bytes("one"),
        },
      ],
      saveFile,
    });

    expect(saveFile).toHaveBeenCalledOnce();
    expect(saveFile).toHaveBeenCalledWith({
      fileId: "imageOne",
      mimeType: "image/png",
      bytes: bytes("one"),
    });
    expect(console.error).toHaveBeenCalledWith(
      "Failed to copy template file missing:",
      expect.any(Error),
    );
  });
});
