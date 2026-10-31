import { describe, expect, it } from "vitest";
import {
  ASSET_PACKAGE_KIND,
  ASSET_PACKAGE_RESOURCE_CONFIGS,
  ASSET_PACKAGE_RESOURCE_TYPES,
} from "../../src/internal/assetPackageResources.js";
import { createAssetImportPlan } from "../../src/internal/assetImportPlan.js";
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
  repository.audioEffects.items["audio-effect-1"] = {
    id: "audio-effect-1",
    type: "audioEffect",
    name: "Fade Out",
    audioEffect: {
      type: "update",
      tween: {
        volume: {
          keyframes: [{ duration: 500, value: 0 }],
        },
      },
    },
  };
  repository.audioEffects.tree[0].children = [{ id: "audio-effect-1" }];

  return {
    schema: "routevn.import-pack.v1",
    package: {
      kind: ASSET_PACKAGE_KIND,
    },
    repository,
  };
};

describe("asset import plan", () => {
  it("accepts every package resource collection and rewrites dependencies", () => {
    const manifest = createManifest();
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/asset-package.json",
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
    const audioEffect = plan.resources.find(
      (resource) => resource.sourceId === "audioEffects:audio-effect-1",
    );
    expect(font.data.fileId).toBe(plan.files[0].destinationId);
    expect(textStyle.data.fontId).toEqual([font.destinationId]);
    expect(textStyle.data.colorId).toBe(color.destinationId);
    expect(textStyle.dependencySourceIds).toEqual(
      expect.arrayContaining(["fonts:font-1", "colors:color-1"]),
    );
    expect(audioEffect).toMatchObject({
      resourceType: "audioEffects",
      type: "audioEffect",
      data: {
        type: "audioEffect",
        audioEffect: {
          type: "update",
        },
      },
    });
    const entrySourceIds = plan.entries.map((entry) => entry.sourceId);
    expect(entrySourceIds.indexOf(font.sourceId)).toBeLessThan(
      entrySourceIds.indexOf(textStyle.sourceId),
    );
    expect(entrySourceIds.indexOf(color.sourceId)).toBeLessThan(
      entrySourceIds.indexOf(textStyle.sourceId),
    );
  });

  it("preserves manifest resource-type and folder order for review", () => {
    const manifest = {
      schema: "routevn.import-pack.v1",
      package: { kind: ASSET_PACKAGE_KIND },
      repository: {
        files: { items: {} },
        variables: {
          items: {
            "folder-variables-one": {
              id: "folder-variables-one",
              type: "folder",
              name: "Variables One",
            },
            "variable-one": {
              id: "variable-one",
              type: "variable",
              name: "Variable One",
              variableType: "string",
              scope: "context",
              default: "one",
              value: "one",
            },
            "folder-variables-two": {
              id: "folder-variables-two",
              type: "folder",
              name: "Variables Two",
            },
            "folder-variables-nested": {
              id: "folder-variables-nested",
              type: "folder",
              name: "Nested Variables",
            },
            "variable-two": {
              id: "variable-two",
              type: "variable",
              name: "Variable Two",
              variableType: "string",
              scope: "context",
              default: "two",
              value: "two",
            },
            "variable-three": {
              id: "variable-three",
              type: "variable",
              name: "Variable Three",
              variableType: "string",
              scope: "context",
              default: "three",
              value: "three",
            },
            "variable-root": {
              id: "variable-root",
              type: "variable",
              name: "Root Variable",
              variableType: "string",
              scope: "context",
              default: "root",
              value: "root",
            },
          },
          tree: [
            {
              id: "folder-variables-one",
              children: [{ id: "variable-one" }],
            },
            {
              id: "folder-variables-two",
              children: [
                {
                  id: "folder-variables-nested",
                  children: [{ id: "variable-two" }],
                },
                { id: "variable-three" },
              ],
            },
            { id: "variable-root" },
          ],
        },
        colors: {
          items: {
            "folder-colors": {
              id: "folder-colors",
              type: "folder",
              name: "Colors Folder",
            },
            "color-one": {
              id: "color-one",
              type: "color",
              name: "Color One",
              hex: "#112233",
            },
          },
          tree: [
            {
              id: "folder-colors",
              children: [{ id: "color-one" }],
            },
          ],
        },
      },
    };
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      repositoryState: {},
      createId: () => `generated-${++id}`,
    });

    expect(plan.reviewSections).toEqual([
      {
        resourceType: "variables",
        items: [
          {
            kind: "folder",
            sourceId: "variables:folder-variables-one",
            name: "Variables One",
            depth: 0,
          },
          {
            kind: "resources",
            sourceIds: ["variables:variable-one"],
            depth: 1,
            parentSourceId: "variables:folder-variables-one",
          },
          {
            kind: "folder",
            sourceId: "variables:folder-variables-two",
            name: "Variables Two",
            depth: 0,
          },
          {
            kind: "folder",
            sourceId: "variables:folder-variables-nested",
            name: "Nested Variables",
            depth: 1,
            parentSourceId: "variables:folder-variables-two",
          },
          {
            kind: "resources",
            sourceIds: ["variables:variable-two"],
            depth: 2,
            parentSourceId: "variables:folder-variables-nested",
          },
          {
            kind: "resources",
            sourceIds: ["variables:variable-three"],
            depth: 1,
            parentSourceId: "variables:folder-variables-two",
          },
          {
            kind: "resources",
            sourceIds: ["variables:variable-root"],
            depth: 0,
          },
        ],
      },
      {
        resourceType: "colors",
        items: [
          {
            kind: "folder",
            sourceId: "colors:folder-colors",
            name: "Colors Folder",
            depth: 0,
          },
          {
            kind: "resources",
            sourceIds: ["colors:color-one"],
            depth: 1,
            parentSourceId: "colors:folder-colors",
          },
        ],
      },
    ]);
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

  it("rejects unresolved required resource references", () => {
    const manifest = createManifest();
    delete manifest.repository.fonts.items["font-1"];
    manifest.repository.fonts.tree[0].children = [];

    expect(() =>
      createAssetImportPlan({
        manifest,
        repositoryState: {},
        createId: () => "generated",
      }),
    ).toThrow("Referenced resource 'font-1' is missing.");
  });

  it("rejects project-only scene and section references", () => {
    const manifest = createManifest();
    manifest.repository.controls.items["control-1"] = {
      id: "control-1",
      type: "control",
      name: "Continue",
      interaction: {
        resetStoryAtSection: { sectionId: "section-1" },
      },
    };
    manifest.repository.controls.tree[0].children = [{ id: "control-1" }];

    expect(() =>
      createAssetImportPlan({
        manifest,
        repositoryState: {},
        createId: () => "generated",
      }),
    ).toThrow("Project reference 'sectionId' is not supported");
  });

  it("rejects file MIME types that do not match their owning resource", () => {
    const manifest = createManifest();
    manifest.repository.files.items["file-font"].mimeType = "text/html";

    expect(() =>
      createAssetImportPlan({
        manifest,
        repositoryState: {},
        createId: () => "generated",
      }),
    ).toThrow("unsupported type for font assets");
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
      manifestUrl: "https://example.com/asset-package.json",
      repositoryState: {},
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    const sound = plan.resources.find(
      (resource) => resource.sourceId === "sounds:sound-1",
    );
    expect(sound).toMatchObject({
      previewSourceId: "file-waveform-preview",
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
    expect(plan.previewFiles.map((file) => file.sourceId)).toContain(
      "file-waveform-preview",
    );
    // The full-screen preview plays the sound itself.
    expect(sound.largePreviewSourceId).toBe("file-sound");
    expect(plan.previewFiles.map((file) => file.sourceId)).toContain(
      "file-sound",
    );
  });

  it("previews colors as swatches of their value", () => {
    const manifest = createManifest();
    manifest.repository.colors.items["color-2"] = {
      id: "color-2",
      type: "color",
      name: "Highlight",
      hex: "#ffd84d",
    };
    manifest.repository.colors.tree[0].children.push({ id: "color-2" });
    let id = 0;

    const plan = createAssetImportPlan({
      manifest,
      manifestUrl: "https://example.com/asset-package.json",
      repositoryState: {},
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    const resource = (sourceId) =>
      plan.resources.find((item) => item.sourceId === sourceId);
    expect(resource("colors:color-1").colorHex).toBe("#112233");
    expect(resource("colors:color-2").colorHex).toBe("#FFD84D");
    expect(resource("colors:color-2").previewSourceId).toBeUndefined();
    expect(resource("fonts:font-1")).not.toHaveProperty("colorHex");
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
      manifestUrl: "https://example.com/asset-package.json",
      repositoryState: {},
      createId: () => `generated-${++id}`,
      resolveFileUrl: ({ descriptor, manifestUrl }) =>
        new URL(descriptor.source.url, manifestUrl).href,
    });

    const particle = plan.resources.find(
      (resource) => resource.sourceId === "particles:particle-1",
    );
    expect(particle).toMatchObject({
      previewSourceId: "file-particle-thumbnail",
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
    expect(plan.previewFiles.map((file) => file.sourceId)).toContain(
      "file-particle-thumbnail",
    );
    expect(particle.largePreviewSourceId).toBe("file-particle-preview");
    expect(plan.previewFiles.map((file) => file.sourceId)).toContain(
      "file-particle-preview",
    );
  });
});

// A v2 pack: a layout the author picked, using a text style that comes as a
// dependency; the text style uses a font, also a dependency, and a color the
// author picked.
const createV2Manifest = () => ({
  schema: "routevn.import-pack.v2",
  package: { kind: ASSET_PACKAGE_KIND, name: "Package Name" },
  repository: {
    files: {
      items: {
        "file-font": {
          id: "file-font",
          mimeType: "font/woff2",
          source: { url: "./files/file-font" },
        },
      },
    },
    colors: {
      items: {
        "color-1": {
          id: "color-1",
          type: "color",
          name: "Ink",
          hex: "#112233",
        },
      },
      tree: [{ id: "color-1" }],
    },
    layouts: {
      items: {
        "folder-menus": { id: "folder-menus", type: "folder", name: "Menus" },
        "layout-1": {
          id: "layout-1",
          type: "layout",
          name: "Title Menu",
          layoutType: "general",
          elements: {
            items: {
              title: {
                id: "title",
                type: "text",
                name: "Title",
                text: "Title",
                textStyleId: "text-style-1",
              },
            },
            tree: [{ id: "title" }],
          },
        },
      },
      tree: [{ id: "folder-menus", children: [{ id: "layout-1" }] }],
    },
  },
  dependencies: {
    fonts: {
      items: {
        "font-1": {
          id: "font-1",
          type: "font",
          name: "Serif",
          fileId: "file-font",
          fontFamily: "Serif",
        },
      },
    },
    textStyles: {
      items: {
        "text-style-1": {
          id: "text-style-1",
          type: "textStyle",
          name: "Title",
          fontId: ["font-1"],
          colorId: "color-1",
          fontSize: 48,
          lineHeight: 1.2,
          fontWeight: "700",
        },
      },
    },
  },
});

const planV2 = (manifest, options = {}) => {
  let id = 0;
  return createAssetImportPlan({
    manifest,
    manifestUrl: "https://example.com/pack/asset-package.json",
    projectId: "project-1",
    repositoryRevision: 1,
    createId: () => `generated-${++id}`,
    dependencyFolderName: "Fantasy UI",
    ...options,
  });
};

describe("asset import plan for v2 packages", () => {
  it("lists only the author's picks and brings their dependencies into folders named after the pack", () => {
    const plan = planV2(createV2Manifest());

    expect(plan.resources.map((resource) => resource.name)).toEqual([
      "Ink",
      "Title Menu",
    ]);
    expect(plan.reviewSections.map((section) => section.resourceType)).toEqual([
      "colors",
      "layouts",
    ]);
    expect(plan.dependencies.map((resource) => resource.name).sort()).toEqual([
      "Serif",
      "Title",
    ]);

    const layout = plan.resources.find(
      (resource) => resource.name === "Title Menu",
    );
    // The color is a pick the layout reaches through its text style, so the
    // review keeps it selected with the layout.
    expect(layout.dependencySourceIds).toEqual(["colors:color-1"]);
    expect([...layout.packageDependencySourceIds].sort()).toEqual([
      "fonts:font-1",
      "textStyles:text-style-1",
    ]);

    const folders = plan.entries.filter(
      (entry) => entry.folder && entry.dependency,
    );
    expect(
      folders.map((entry) => [entry.resourceType, entry.data.name]),
    ).toEqual(
      expect.arrayContaining([
        ["fonts", "Fantasy UI"],
        ["textStyles", "Fantasy UI"],
      ]),
    );
    const destinationOf = (sourceId) =>
      plan.entries.find((entry) => entry.sourceId === sourceId).destinationId;
    const textStyle = plan.dependencies.find(
      (resource) => resource.name === "Title",
    );
    expect(textStyle.parentDestinationId).toBe(
      destinationOf("dependencies:textStyles"),
    );
    expect(layout.data.elements.items.title.textStyleId).toBe(
      textStyle.destinationId,
    );
    expect(textStyle.data.fontId).toEqual([destinationOf("fonts:font-1")]);
    expect(textStyle.data.colorId).toBe(destinationOf("colors:color-1"));
    expect(plan.files.map((file) => file.sourceId)).toEqual(["file-font"]);
  });

  it("numbers a dependency folder whose name the project or the pack already uses", () => {
    // The pack's own colors sit in a top-level "Fantasy UI" folder, and the
    // text style uses a second color that comes as a dependency.
    const manifest = createV2Manifest();
    manifest.repository.colors = {
      items: {
        "folder-colors": {
          id: "folder-colors",
          type: "folder",
          name: "Fantasy UI",
        },
        "color-1": manifest.repository.colors.items["color-1"],
      },
      tree: [{ id: "folder-colors", children: [{ id: "color-1" }] }],
    };
    manifest.dependencies.colors = {
      items: {
        "color-2": {
          id: "color-2",
          type: "color",
          name: "Gold",
          hex: "#FFD84D",
        },
      },
    };
    manifest.dependencies.textStyles.items["text-style-1"].colorId = "color-2";
    const plan = planV2(manifest, {
      repositoryState: {
        fonts: {
          items: { mine: { id: "mine", type: "folder", name: "fantasy ui" } },
          tree: [{ id: "mine" }],
        },
      },
    });

    const folderName = (resourceType) =>
      plan.entries.find(
        (entry) => entry.sourceId === `dependencies:${resourceType}`,
      ).data.name;
    expect(folderName("fonts")).toBe("Fantasy UI 2");
    expect(folderName("colors")).toBe("Fantasy UI 2");
    expect(folderName("textStyles")).toBe("Fantasy UI");

    const unnamed = planV2(createV2Manifest(), {
      dependencyFolderName: undefined,
    });
    expect(
      unnamed.entries.find((entry) => entry.sourceId === "dependencies:fonts")
        .data.name,
    ).toBe("Package Name");
  });

  it.each([
    [
      "a v1 package with dependencies",
      (manifest) => {
        manifest.schema = "routevn.import-pack.v1";
      },
      "unsupported_field",
    ],
    [
      "a dependency folder",
      (manifest) => {
        manifest.dependencies.fonts.items["font-1"].type = "folder";
      },
      "unsupported_resource",
    ],
    [
      "a dependency tree",
      (manifest) => {
        manifest.dependencies.fonts.tree = [{ id: "font-1" }];
      },
      "unsupported_field",
    ],
    [
      "a resource that is both picked and a dependency",
      (manifest) => {
        manifest.dependencies.colors = {
          items: {
            "color-1": {
              id: "color-1",
              type: "color",
              name: "Ink",
              hex: "#112233",
            },
          },
        };
      },
      "duplicate_resource_id",
    ],
    [
      "a dependency nothing uses",
      (manifest) => {
        manifest.dependencies.colors = {
          items: {
            "color-2": {
              id: "color-2",
              type: "color",
              name: "Spare",
              hex: "#445566",
            },
          },
        };
      },
      "unused_dependency",
    ],
    [
      "more than 500 picks and dependencies of one type",
      (manifest) => {
        for (let index = 0; index < 500; index += 1) {
          manifest.dependencies.colors ??= { items: {} };
          manifest.dependencies.colors.items[`spare-${index}`] = {
            id: `spare-${index}`,
            type: "color",
            name: `Spare ${index}`,
            hex: "#445566",
          };
        }
      },
      "too_many_resources",
    ],
  ])("rejects %s", (_name, edit, code) => {
    const manifest = createV2Manifest();
    edit(manifest);
    expect(() => planV2(manifest)).toThrow(expect.objectContaining({ code }));
  });
});
