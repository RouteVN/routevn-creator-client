import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createResourceImportPlan,
  rewriteResourceImportPlanReferences,
} from "../../src/internal/resourceImportPlan.js";

const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../fixtures/import-packages/${name}`, import.meta.url),
      "utf8",
    ),
  );

const createRepositoryState = () => ({
  transforms: {
    items: {
      "folder.transforms": {
        id: "folder.transforms",
        type: "folder",
        name: "Transforms",
      },
    },
    tree: [{ id: "folder.transforms" }],
  },
  animations: {
    items: {
      "folder.animations": {
        id: "folder.animations",
        type: "folder",
        name: "Animations",
      },
    },
    tree: [{ id: "folder.animations" }],
  },
  images: { items: {}, tree: [] },
  tags: {},
});

const createPlan = (manifest, expectedResourceType = "transforms") => {
  let id = 0;
  return createResourceImportPlan({
    manifest,
    manifestUrl: "http://localhost:4179/manifests/package.json",
    expectedResourceType,
    repositoryState: createRepositoryState(),
    repositoryRevision: 7,
    createId: () => `generated-${++id}`,
    resolveFileUrl: ({ descriptor, manifestUrl }) =>
      new URL(descriptor.source.url, manifestUrl).href,
  });
};

describe("resourceImportPlan", () => {
  it("plans all transforms, puts primary first, and deduplicates dependencies", () => {
    const plan = createPlan(fixture("transforms.valid.json"));
    expect(plan.package.defaultFolderName).toBe("Test Transforms");
    expect(plan.resources.map((resource) => resource.sourceId)).toEqual([
      "transform.primary",
      "transform.secondary",
    ]);
    expect(plan.images).toHaveLength(1);
    expect(plan.images[0].previewUrl).toBe(
      "http://localhost:4179/files/pixel.png",
    );
    expect(plan.resources.map((resource) => resource.previewUrl)).toEqual([
      "http://localhost:4179/files/pixel.png",
      "http://localhost:4179/files/pixel.png",
    ]);
    expect(plan.images[0].usedByResourceIds).toEqual([
      "transform.primary",
      "transform.secondary",
    ]);
    expect(plan.files).toHaveLength(1);
    expect(plan.tags).toHaveLength(1);
    expect(plan.tags[0]).toMatchObject({
      mode: "create",
      scopeKey: "transforms",
    });
    expect(plan.destinationFolders).toEqual({
      resource: {
        destinationId: expect.stringMatching(/^generated-/),
        commandId: expect.stringMatching(/^generated-/),
      },
      images: {
        destinationId: expect.stringMatching(/^generated-/),
        commandId: expect.stringMatching(/^generated-/),
      },
    });
    expect(
      new Set(
        Object.values(plan.destinationFolders).flatMap((destination) => [
          destination.destinationId,
          destination.commandId,
        ]),
      ).size,
    ).toBe(4);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.destinationFolders)).toBe(true);
    expect(Object.isFrozen(plan.resources[0].data)).toBe(true);
  });

  it("maps a replacement image into every selected resource", () => {
    const plan = createPlan(fixture("transforms.valid.json"));
    const resources = rewriteResourceImportPlanReferences({
      plan,
      resourceChoices: {
        "image.pixel": {
          mode: "existing",
          projectResourceId: "project-image",
        },
      },
      resourceNames: {
        "transform.primary": "Renamed Primary",
      },
      resourceDescriptions: {
        "transform.primary": "Updated description",
      },
    });
    expect(resources[0].data.name).toBe("Renamed Primary");
    expect(resources[0].data.description).toBe("Updated description");
    expect(resources[0].data.preview.background.imageId).toBe("project-image");
    expect(resources[1].data.preview.target.imageId).toBe("project-image");
  });

  it("exposes MP4 preview media without importing it into project data", () => {
    const plan = createPlan(fixture("animations.valid.json"), "animations");
    expect(plan.resources).toHaveLength(2);
    expect(plan.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previewUrl: "http://localhost:4179/files/preview.mp4",
          previewKind: "video",
          previewMimeType: "video/mp4",
        }),
      ]),
    );
    expect(plan.resources[0].data.previewMediaFileId).toBeUndefined();
    expect(plan.files.map((file) => file.sourceId)).toEqual(["file.mask"]);
    expect(plan.knownDownloadBytes).toBe(68);
  });

  it("rejects unsupported preview media types", () => {
    const manifest = fixture("animations.valid.json");
    manifest.repository.files.items["file.animation-preview"].mimeType =
      "audio/mpeg";
    expect(() => createPlan(manifest, "animations")).toThrow(
      "A package preview must be a JPEG, PNG, WebP, or MP4 file.",
    );
  });

  it("rejects unknown resource fields before command creation", () => {
    const manifest = fixture("transforms.valid.json");
    manifest.repository.transforms.items["transform.primary"].unexpected = true;
    expect(() => createPlan(manifest)).toThrow("unexpected is not supported");
  });

  it("rejects empty names and invalid creator-model animation data", () => {
    const transformManifest = fixture("transforms.valid.json");
    transformManifest.repository.transforms.items["transform.primary"].name =
      "";
    expect(() => createPlan(transformManifest)).toThrow("must be valid text");

    const emptyFolderNameManifest = fixture("transforms.valid.json");
    emptyFolderNameManifest.package.defaultFolderName = "";
    expect(() => createPlan(emptyFolderNameManifest)).toThrow(
      "package.package.defaultFolderName must be valid text",
    );

    const animationManifest = fixture("animations.valid.json");
    animationManifest.repository.animations.items[
      "animation.transition"
    ].animation.mask.progress.keyframes[0].duration = -1;
    expect(() => createPlan(animationManifest, "animations")).toThrow();
  });

  it("rejects missing tree items and missing referenced tags", () => {
    const missingTreeItem = fixture("transforms.valid.json");
    missingTreeItem.repository.transforms.tree.push({ id: "missing" });
    expect(() => createPlan(missingTreeItem)).toThrow("missing item 'missing'");

    const missingTag = fixture("transforms.valid.json");
    delete missingTag.repository.tags.transforms.items["tag.motion"];
    missingTag.repository.tags.transforms.tree = [];
    expect(() => createPlan(missingTag)).toThrow("tag 'tag.motion' is missing");
  });
});
