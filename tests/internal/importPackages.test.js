import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchImportPackageJson,
  validateImportFileDescriptor,
  validateImportPackageObject,
} from "../../src/internal/importPackages.js";

const originalFetch = globalThis.fetch;

describe("importPackages", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects import URLs that do not return JSON content", async () => {
    const json = vi.fn();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get: vi.fn(() => "text/html"),
      },
      json,
    }));

    await expect(
      fetchImportPackageJson({
        url: "https://example.com/package.json",
      }),
    ).rejects.toThrow("Import URL must return JSON.");
    expect(json).not.toHaveBeenCalled();
  });

  it("rejects import URLs whose body is not valid JSON", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get: vi.fn(() => "application/json"),
      },
      json: vi.fn(async () => {
        throw new SyntaxError("Unexpected token");
      }),
    }));

    await expect(
      fetchImportPackageJson({
        url: "https://example.com/package.json",
      }),
    ).rejects.toThrow("Import URL did not return valid JSON.");
  });

  it("validates package envelope shape and schema", () => {
    expect(() => validateImportPackageObject([])).toThrow(
      "Import package must be a JSON object.",
    );
    expect(() =>
      validateImportPackageObject({
        schema: "routevn.import-pack.v999",
      }),
    ).toThrow("Unsupported import package schema.");
    expect(() =>
      validateImportPackageObject({
        schema: "routevn.import-pack.v1",
      }),
    ).toThrow("Import package repository is missing.");
  });

  it("validates file dependency descriptors", () => {
    const importInput = {
      repository: {
        files: {
          items: {
            "file.mask": {
              source: {
                url: "https://example.com/mask.png",
              },
            },
          },
        },
      },
    };

    expect(
      validateImportFileDescriptor({
        importInput,
        fileId: "file.mask",
        label: 'Image dependency "Mask"',
      }),
    ).toEqual({
      source: {
        url: "https://example.com/mask.png",
      },
    });
    expect(() =>
      validateImportFileDescriptor({
        importInput: {
          files: {
            "file.mask": {
              url: "/mask.png",
            },
          },
        },
        fileId: "file.mask",
        label: 'Image dependency "Mask"',
      }),
    ).toThrow('Image dependency "Mask" has an invalid file URL.');
  });
});
