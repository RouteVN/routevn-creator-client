import { describe, expect, it } from "vitest";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "../../src/internal/project/layout.js";

const build = (video, node = {}, videoRenderMode) =>
  buildLayoutElements(
    [
      {
        id: "node",
        type: "video",
        videoId: "video",
        width: 640,
        height: 360,
        ...node,
      },
    ],
    {},
    { items: {} },
    { items: {} },
    { items: {} },
    {
      videosData: { items: { video } },
      filesData: { items: { file: { mimeType: "video/webm" } } },
      videoRenderMode,
    },
  ).elements[0];

const video = { type: "video", fileId: "file", thumbnailFileId: "thumb" };

describe("layout video rendering", () => {
  it("resolves video metadata and playback defaults", () => {
    const element = build(video);
    expect(element).toMatchObject({
      type: "video",
      src: "file",
      fileType: "video/webm",
      loop: true,
      volume: 100,
      width: 640,
      height: 360,
    });
    expect(extractFileIdsFromRenderState([element])).toContainEqual(
      expect.objectContaining({ url: "file", type: "video/webm" }),
    );
    expect(build(video, { loop: false, volume: 35 })).toMatchObject({
      loop: false,
      volume: 35,
    });
  });
  it("renders missing, folder, and fileless resources as containers", () => {
    for (const item of [undefined, { type: "folder" }, { type: "video" }])
      expect(build(item).type).toBe("container");
  });
  it("mutes editor playback", () => {
    expect(build(video, { volume: 60 }, "editor")).toMatchObject({
      type: "video",
      volume: 0,
    });
  });
});

it("finds and remaps a layout video in asset packages", async () => {
  const { visitAssetPackageReferences, mapAssetPackageReferences } =
    await import("../../src/internal/assetPackageResources.js");
  const layout = { elements: [{ type: "video", videoId: "video-one" }] };
  const references = [];
  visitAssetPackageReferences(layout, (reference) =>
    references.push(reference),
  );
  expect(references).toContainEqual(
    expect.objectContaining({
      fieldName: "videoId",
      kind: "resource",
      value: "video-one",
    }),
  );
  expect(
    mapAssetPackageReferences(layout, ({ value }) =>
      value === "video-one" ? "video-two" : value,
    ).elements[0].videoId,
  ).toBe("video-two");
});
