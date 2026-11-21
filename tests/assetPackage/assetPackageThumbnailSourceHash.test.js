import { describe, expect, it } from "vitest";
import {
  ASSET_PACKAGE_MANIFEST_PATH,
  createTestProject,
  exportAssetPackageFiles,
} from "../../scripts/generate-asset-package-fixtures.js";
import { createAssetImportPlan } from "../../src/internal/assetImportPlan.js";

// A package is read by app versions whose model has no thumbnail source hash
// on an animation, so the exporter leaves that hash out. These export from a
// real project and import with the real model.

const SOURCE_HASH = "a".repeat(64);

const create = (resourceType, id, data, parentId) => ({
  type: `${resourceType}.create`,
  payload: {
    [`${resourceType}Id`]: id,
    data,
    parentId: parentId ?? null,
    position: "last",
  },
});

const createFile = (fileId, mimeType) => ({
  type: "file.create",
  payload: {
    fileId,
    data: { mimeType, size: 1, sha256: "b".repeat(64) },
  },
});

const animationData = {
  type: "animation",
  name: "Animation One",
  thumbnailFileId: "file-thumbnail-one",
  thumbnailSourceHash: SOURCE_HASH,
  animation: {
    type: "update",
    tween: { alpha: { keyframes: [{ duration: 100, value: 1 }] } },
  },
};

const createProject = async (commands) => {
  const project = await createTestProject({
    projectId: "project-one",
    idPrefix: "project-one",
  });
  await project.submit([
    createFile("file-thumbnail-one", "image/jpeg"),
    ...commands,
  ]);
  return project;
};

const exportManifest = async (project, selectedFolderIdsByType) => {
  const files = await exportAssetPackageFiles({
    repositoryState: project.repository.getState(),
    fileBytesById: new Map([["file-thumbnail-one", new Uint8Array([1])]]),
    selectedFolderIdsByType,
  });
  return {
    files,
    manifest: JSON.parse(
      new TextDecoder().decode(files.get(ASSET_PACKAGE_MANIFEST_PATH)),
    ),
  };
};

const planImport = (manifest) => {
  let idCount = 0;
  return createAssetImportPlan({
    manifest,
    projectId: "project-two",
    repositoryState: {},
    repositoryRevision: 1,
    createId: () => `imported-${++idCount}`,
  });
};

describe("asset package format: thumbnail source hashes", () => {
  it("leaves the source hash out of a picked animation and keeps its thumbnail", async () => {
    const project = await createProject([
      create("animation", "folder-animations", {
        type: "folder",
        name: "Animations",
      }),
      create("animation", "animation-one", animationData, "folder-animations"),
    ]);

    const { files, manifest } = await exportManifest(project, {
      animations: ["folder-animations"],
    });

    const animation = manifest.repository.animations.items["animation-one"];
    expect(animation.thumbnailFileId).toBe("file-thumbnail-one");
    expect(animation).not.toHaveProperty("thumbnailSourceHash");
    expect(files.has("files/file-thumbnail-one")).toBe(true);
    // The project keeps the hash of its own thumbnail.
    expect(
      project.repository.getState().animations.items["animation-one"]
        .thumbnailSourceHash,
    ).toBe(SOURCE_HASH);
  });

  it("imports the animation with the package's thumbnail and no source hash", async () => {
    const project = await createProject([
      create("animation", "folder-animations", {
        type: "folder",
        name: "Animations",
      }),
      create("animation", "animation-one", animationData, "folder-animations"),
    ]);
    const { manifest } = await exportManifest(project, {
      animations: ["folder-animations"],
    });

    const plan = planImport(manifest);

    const thumbnail = plan.files.find(
      (file) => file.sourceId === "file-thumbnail-one",
    );
    const imported = plan.resources.find(
      (resource) => resource.packageSourceId === "animation-one",
    );
    expect(thumbnail.destinationId).not.toBe("file-thumbnail-one");
    expect(imported.data).toEqual({
      type: "animation",
      name: "Animation One",
      thumbnailFileId: thumbnail.destinationId,
      animation: animationData.animation,
    });
  });

  it("leaves the source hash out of an animation carried as a dependency", async () => {
    const project = await createProject([
      create("animation", "animation-one", animationData),
      create("layout", "folder-layouts", { type: "folder", name: "Layouts" }),
      create(
        "layout",
        "layout-one",
        {
          type: "layout",
          name: "Layout One",
          layoutType: "general",
          elements: {
            items: {
              "element-one": {
                id: "element-one",
                type: "rect",
                name: "Button",
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                anchorX: 0,
                anchorY: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                click: {
                  payload: {
                    actions: {
                      background: {
                        animations: { resourceId: "animation-one" },
                      },
                    },
                  },
                },
              },
            },
            tree: [{ id: "element-one", children: [] }],
          },
        },
        "folder-layouts",
      ),
    ]);

    const { manifest } = await exportManifest(project, {
      layouts: ["folder-layouts"],
    });

    const animation = manifest.dependencies.animations.items["animation-one"];
    expect(animation.thumbnailFileId).toBe("file-thumbnail-one");
    expect(animation).not.toHaveProperty("thumbnailSourceHash");
    expect(() => planImport(manifest)).not.toThrow();
  });

  // Every app version that imports packages accepts the hash on these.
  it("keeps the source hash of a transform", async () => {
    const project = await createProject([
      create("transform", "folder-transforms", {
        type: "folder",
        name: "Transforms",
      }),
      create(
        "transform",
        "transform-one",
        {
          type: "transform",
          name: "Transform One",
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0,
          anchorY: 0,
          rotation: 0,
          thumbnailFileId: "file-thumbnail-one",
          thumbnailSourceHash: SOURCE_HASH,
        },
        "folder-transforms",
      ),
    ]);

    const { manifest } = await exportManifest(project, {
      transforms: ["folder-transforms"],
    });

    expect(manifest.repository.transforms.items["transform-one"]).toMatchObject(
      {
        thumbnailFileId: "file-thumbnail-one",
        thumbnailSourceHash: SOURCE_HASH,
      },
    );
    expect(() => planImport(manifest)).not.toThrow();
  });
});
