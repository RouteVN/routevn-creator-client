import { describe, expect, it } from "vitest";
import {
  collectAnimationPreviewFileIds,
  createAnimationThumbnailSource,
} from "../../src/internal/animationPreview.js";

const createImage = (id, fileId, fileType) => {
  const image = {
    id,
    type: "image",
    name: id,
    fileId,
    width: 1280,
    height: 720,
  };
  if (fileType) {
    image.fileType = fileType;
  }
  return image;
};

const createRepositoryState = () => ({
  project: { resolution: { width: 1280, height: 720 } },
  images: {
    tree: [{ id: "image-1" }, { id: "image-2" }, { id: "image-mask" }],
    items: {
      "image-1": createImage("image-1", "file-1", "image/webp"),
      "image-2": createImage("image-2", "file-2"),
      "image-mask": createImage("image-mask", "file-mask", "image/png"),
    },
  },
});

const createMaskedTransition = () => ({
  id: "animation-1",
  type: "animation",
  name: "Animation One",
  preview: {
    outgoing: { imageId: "image-1" },
    incoming: { imageId: "image-2" },
  },
  animation: {
    type: "transition",
    mask: {
      kind: "single",
      imageId: "image-mask",
      channel: "red",
      progress: {
        initialValue: 0,
        keyframes: [{ duration: 1000, value: 1 }],
      },
    },
  },
});

const sortedAssets = (source) =>
  [...source.assets].sort((left, right) =>
    left.fileId.localeCompare(right.fileId),
  );

describe("animation preview files", () => {
  it("collects the sprites at any depth and the textures of every kind of mask", () => {
    expect(
      collectAnimationPreviewFileIds({
        elements: [
          { id: "background", type: "sprite", src: "file-1" },
          {
            id: "group",
            type: "container",
            children: [
              { id: "nested", type: "sprite", src: "file-2" },
              { id: "fill", type: "rect" },
            ],
          },
          // A sprite with nothing to draw yet.
          { id: "empty", type: "sprite" },
        ],
        animations: [
          { id: "single", mask: { kind: "single", texture: "file-3" } },
          {
            id: "sequence",
            mask: { kind: "sequence", textures: ["file-4", undefined] },
          },
          {
            id: "composite",
            mask: { kind: "composite", items: [{ texture: "file-5" }, {}] },
          },
          {
            id: "list",
            mask: [{ kind: "single", texture: "file-6" }, { kind: "single" }],
          },
          { id: "unmasked" },
        ],
      }),
    ).toEqual(["file-1", "file-2", "file-3", "file-4", "file-5", "file-6"]);
  });

  it("collects nothing from a state that draws no file", () => {
    expect(collectAnimationPreviewFileIds()).toEqual([]);
    expect(
      collectAnimationPreviewFileIds({
        elements: [{ id: "fill", type: "rect" }],
        animations: [],
      }),
    ).toEqual([]);
  });
});

describe("animation thumbnail source", () => {
  it("draws a masked transition at the project's size, halfway through, with its preview images and its mask", () => {
    const repositoryState = createRepositoryState();
    const source = createAnimationThumbnailSource({
      item: createMaskedTransition(),
      repositoryState,
    });

    expect(source).toMatchObject({
      width: 1280,
      height: 720,
      animationFrame: { timeMs: 500, preparationPassCount: 2 },
    });
    // The outgoing image is only in the start, the mask only in the
    // animation. An image with no type of its own leaves it to the file.
    expect(sortedAssets(source)).toEqual([
      { fileId: "file-1", fileType: "image/webp" },
      { fileId: "file-2", fileType: undefined },
      { fileId: "file-mask", fileType: "image/png" },
    ]);
    expect(source.renderState.animations[0].mask).toMatchObject({
      kind: "single",
      texture: "file-mask",
    });
    expect(
      collectAnimationPreviewFileIds(source.animationFrame.resetState),
    ).toContain("file-1");
  });

  it("is the same for the same saved animation, so its hash holds", () => {
    const create = () =>
      createAnimationThumbnailSource({
        item: createMaskedTransition(),
        repositoryState: createRepositoryState(),
      });

    expect(create()).toEqual(create());
  });

  it("changes with the animation, a preview image's file, and the project's size", () => {
    const base = JSON.stringify(
      createAnimationThumbnailSource({
        item: createMaskedTransition(),
        repositoryState: createRepositoryState(),
      }),
    );
    const longer = createMaskedTransition();
    longer.animation.mask.progress.keyframes[0].duration = 2000;
    const replaced = createRepositoryState();
    replaced.images.items["image-1"].fileId = "file-1-new";
    const resized = createRepositoryState();
    resized.project.resolution = { width: 1920, height: 1080 };

    for (const [item, repositoryState] of [
      [longer, createRepositoryState()],
      [createMaskedTransition(), replaced],
      [createMaskedTransition(), resized],
    ]) {
      expect(
        JSON.stringify(
          createAnimationThumbnailSource({ item, repositoryState }),
        ),
      ).not.toBe(base);
    }
  });

  it("draws the default sides of an animation with no preview images, with no file to load", () => {
    const source = createAnimationThumbnailSource({
      item: {
        id: "animation-2",
        type: "animation",
        name: "Animation Two",
        animation: {
          type: "update",
          tween: { x: { keyframes: [{ duration: 300, value: 100 }] } },
        },
      },
      repositoryState: createRepositoryState(),
    });

    expect(source.assets).toEqual([]);
    expect(source.animationFrame).toMatchObject({
      timeMs: 150,
      preparationPassCount: 1,
    });
  });

  it("needs the project's resolution", () => {
    const repositoryState = createRepositoryState();
    delete repositoryState.project.resolution;

    expect(() =>
      createAnimationThumbnailSource({
        item: createMaskedTransition(),
        repositoryState,
      }),
    ).toThrow();
  });
});
