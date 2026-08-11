import { describe, expect, it } from "vitest";
import {
  ASSET_PACKAGE_KIND,
  ASSET_PACKAGE_RESOURCE_CONFIGS,
  ASSET_PACKAGE_RESOURCE_TYPES,
} from "../../src/internal/assetPackageResources.js";
import {
  createAssetImportPlan,
  isAssetPackageManifest,
} from "../../src/internal/assetImportPlan.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";

const createCollection = (resourceType) => {
  const folderId = `folder-${resourceType}`;
  return {
    items: {
      [folderId]: {
        id: folderId,
        type: "folder",
        name: resourceType,
      },
    },
    tree: [{ id: folderId }],
  };
};

const createManifest = () => {
  const repository = {
    files: {
      items: {
        "file-font": {
          id: "file-font",
          mimeType: "font/woff2",
          source: { url: "./files/file-font" },
        },
      },
    },
  };
  for (const { resourceType } of ASSET_PACKAGE_RESOURCE_CONFIGS) {
    repository[resourceType] = createCollection(resourceType);
  }

  repository.fonts.items["font-1"] = {
    id: "font-1",
    type: "font",
    name: "Body Font",
    fileId: "file-font",
    fontFamily: "Body Font",
  };
  repository.fonts.tree[0].children = [{ id: "font-1" }];
  repository.colors.items["color-1"] = {
    id: "color-1",
    type: "color",
    name: "Body Color",
    hex: "#112233",
  };
  repository.colors.tree[0].children = [{ id: "color-1" }];
  repository.textStyles.items["text-style-1"] = {
    id: "text-style-1",
    type: "textStyle",
    name: "Body",
    fontId: ["font-1"],
    colorId: "color-1",
    fontSize: 24,
    lineHeight: 1.5,
    fontWeight: "400",
  };
  repository.textStyles.tree[0].children = [{ id: "text-style-1" }];

  return {
    schema: "routevn.import-pack.v1",
    package: {
      kind: ASSET_PACKAGE_KIND,
      id: "example.all-resources",
      name: "All Resources",
      version: "1.0.0",
    },
    repository,
  };
};

describe("asset import plan", () => {
  it("accepts every package resource collection and rewrites dependencies", () => {
    const manifest = createManifest();
    let id = 0;

    expect(isAssetPackageManifest(manifest, "animations")).toBe(true);
    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/package.json",
      repositoryState: {},
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    expect(new Set(plan.entries.map((entry) => entry.resourceType))).toEqual(
      new Set(ASSET_PACKAGE_RESOURCE_TYPES),
    );
    const font = plan.resources.find(
      (resource) => resource.sourceId === "fonts:font-1",
    );
    const color = plan.resources.find(
      (resource) => resource.sourceId === "colors:color-1",
    );
    const textStyle = plan.resources.find(
      (resource) => resource.sourceId === "textStyles:text-style-1",
    );
    expect(font.data.fileId).toBe(plan.files[0].destinationId);
    expect(textStyle.data.fontId).toEqual([font.destinationId]);
    expect(textStyle.data.colorId).toBe(color.destinationId);
    expect(textStyle.dependencySourceIds).toEqual(
      expect.arrayContaining(["fonts:font-1", "colors:color-1"]),
    );
    const entrySourceIds = plan.entries.map((entry) => entry.sourceId);
    expect(entrySourceIds.indexOf(font.sourceId)).toBeLessThan(
      entrySourceIds.indexOf(textStyle.sourceId),
    );
    expect(entrySourceIds.indexOf(color.sourceId)).toBeLessThan(
      entrySourceIds.indexOf(textStyle.sourceId),
    );
  });

  it("keeps legacy animation packages on the existing importer path", () => {
    const manifest = createManifest();
    delete manifest.repository.sounds;
    for (const resourceType of ASSET_PACKAGE_RESOURCE_TYPES) {
      if (resourceType !== "animations" && resourceType !== "images") {
        delete manifest.repository[resourceType];
      }
    }

    expect(isAssetPackageManifest(manifest, "animations")).toBe(true);
    delete manifest.package.kind;
    expect(isAssetPackageManifest(manifest, "animations")).toBe(false);
  });

  it("does not rewrite non-reference values that match resource ids", () => {
    const manifest = createManifest();
    manifest.repository.variables.items["variable-1"] = {
      id: "variable-1",
      type: "variable",
      name: "Stored color id",
      variableType: "string",
      scope: "context",
      default: "color-1",
      value: "color-1",
    };
    manifest.repository.variables.tree[0].children = [{ id: "variable-1" }];
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      repositoryState: {},
      createId: () => `generated-${++id}`,
    });
    const variable = plan.resources.find(
      (resource) => resource.sourceId === "variables:variable-1",
    );

    expect(variable.data.default).toBe("color-1");
    expect(variable.data.value).toBe("color-1");
    expect(variable.dependencySourceIds).toEqual([]);
  });

  it("rewrites computed variable references without changing literal values", () => {
    const manifest = createManifest();
    manifest.repository.variables.items.variableBase = {
      id: "variableBase",
      type: "variable",
      name: "Base",
      variableType: "string",
      scope: "context",
      default: "color-1",
      value: "color-1",
    };
    manifest.repository.variables.items.variableDerived = {
      id: "variableDerived",
      type: "variable",
      name: "Derived",
      variableType: "string",
      computed: { expr: { var: "variables.variableBase" } },
    };
    manifest.repository.variables.tree[0].children = [
      { id: "variableDerived" },
      { id: "variableBase" },
    ];
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      repositoryState: {},
      createId: () => `generated-${++id}`,
    });
    const base = plan.resources.find(
      (resource) => resource.sourceId === "variables:variableBase",
    );
    const derived = plan.resources.find(
      (resource) => resource.sourceId === "variables:variableDerived",
    );

    expect(base.data.default).toBe("color-1");
    expect(base.data.value).toBe("color-1");
    expect(derived.data.computed.expr.var).toBe(
      `variables[${JSON.stringify(base.destinationId)}]`,
    );
    expect(derived.dependencySourceIds).toContain("variables:variableBase");
  });

  it("shows sound waveform previews without importing the preview PNG", () => {
    const manifest = createManifest();
    manifest.repository.files.items["file-sound"] = {
      id: "file-sound",
      mimeType: "audio/mpeg",
      source: { url: "./files/file-sound" },
    };
    manifest.repository.files.items["file-waveform"] = {
      id: "file-waveform",
      mimeType: "application/json",
      source: { url: "./files/file-waveform" },
    };
    manifest.repository.files.items["file-waveform-preview"] = {
      id: "file-waveform-preview",
      mimeType: "image/png",
      source: { url: "./files/file-waveform-preview" },
    };
    manifest.repository.sounds.items["sound-1"] = {
      id: "sound-1",
      type: "sound",
      name: "Theme",
      fileId: "file-sound",
      waveformDataFileId: "file-waveform",
      duration: 1.5,
      previewMediaFileId: "file-waveform-preview",
    };
    manifest.repository.sounds.tree[0].children = [{ id: "sound-1" }];
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/package.json",
      repositoryState: {},
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    const sound = plan.resources.find(
      (resource) => resource.sourceId === "sounds:sound-1",
    );
    expect(sound).toMatchObject({
      previewUrl: "https://example.com/files/file-waveform-preview",
      previewKind: "image",
      previewMimeType: "image/png",
    });
    expect(sound.data.previewMediaFileId).toBeUndefined();
    expect(plan.files.map((file) => file.sourceId)).toEqual(
      expect.arrayContaining(["file-sound", "file-waveform"]),
    );
    expect(plan.files.map((file) => file.sourceId)).not.toContain(
      "file-waveform-preview",
    );
  });

  it("accepts package-only WebM previews", () => {
    const manifest = createManifest();
    manifest.repository.files.items["file-particle-preview"] = {
      id: "file-particle-preview",
      mimeType: "video/webm",
      source: { url: "./files/file-particle-preview" },
    };
    manifest.repository.files.items["file-particle-thumbnail"] = {
      id: "file-particle-thumbnail",
      mimeType: "video/webm",
      source: { url: "./files/file-particle-thumbnail" },
    };
    manifest.repository.particles.items["particle-1"] = {
      ...createParticlePreset({
        presetId: "sparkle",
        projectResolution: { width: 640, height: 360 },
      }),
      id: "particle-1",
      previewMediaFileId: "file-particle-preview",
      thumbnailMediaFileId: "file-particle-thumbnail",
    };
    manifest.repository.particles.tree[0].children = [{ id: "particle-1" }];
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/package.json",
      repositoryState: {},
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    const particle = plan.resources.find(
      (resource) => resource.sourceId === "particles:particle-1",
    );
    expect(particle).toMatchObject({
      previewUrl: "https://example.com/files/file-particle-thumbnail",
      previewKind: "video",
      previewMimeType: "video/webm",
    });
    expect(particle.data.previewMediaFileId).toBeUndefined();
    expect(particle.data.thumbnailMediaFileId).toBeUndefined();
    expect(plan.files.map((file) => file.sourceId)).not.toContain(
      "file-particle-preview",
    );
    expect(plan.files.map((file) => file.sourceId)).not.toContain(
      "file-particle-thumbnail",
    );
  });
});
