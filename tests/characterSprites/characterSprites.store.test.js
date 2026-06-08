import { describe, expect, it } from "vitest";
import {
  addPendingUploads,
  createInitialState,
  removePendingUploads,
  setActiveTagIds,
  selectAdjacentSpriteItemId,
  selectViewData,
  setFullImagePreviewDisplayMode,
  setProjectResolution,
  setSelectedItemId,
  showFullImagePreview,
} from "../../src/pages/characterSprites/characterSprites.store.js";

describe("characterSprites store", () => {
  it("hides a resolved sprite item while its pending upload card is still visible", () => {
    const state = createInitialState();
    state.characterName = "Hero";
    state.spritesData = {
      tree: [
        {
          id: "folder-1",
          children: [{ id: "sprite-1" }],
        },
      ],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Main",
        },
        "sprite-1": {
          id: "sprite-1",
          type: "image",
          name: "Hero Idle",
          fileId: "file-1",
          thumbnailFileId: "thumb-1",
        },
      },
    };

    addPendingUploads(
      { state },
      {
        items: [
          {
            id: "pending-sprite-1",
            parentId: "folder-1",
            name: "Hero Idle",
            resolvedItemId: "sprite-1",
          },
        ],
      },
    );

    const viewDataWhilePending = selectViewData({ state });
    expect(
      viewDataWhilePending.mediaGroups[0].children.map((child) => child.id),
    ).toEqual(["pending-sprite-1"]);

    removePendingUploads(
      { state },
      {
        itemIds: ["pending-sprite-1"],
      },
    );

    const viewDataAfterPending = selectViewData({ state });
    expect(
      viewDataAfterPending.mediaGroups[0].children.map((child) => child.id),
    ).toEqual(["sprite-1"]);
  });

  it("filters and searches sprites by tags", () => {
    const state = createInitialState();
    state.characterName = "Hero";
    state.tagsData = {
      tree: [{ id: "tag-idle" }, { id: "tag-attack" }],
      items: {
        "tag-idle": {
          id: "tag-idle",
          type: "tag",
          name: "Idle",
        },
        "tag-attack": {
          id: "tag-attack",
          type: "tag",
          name: "Attack",
        },
      },
    };
    state.spritesData = {
      tree: [
        {
          id: "folder-1",
          children: [{ id: "sprite-1" }, { id: "sprite-2" }],
        },
      ],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Main",
        },
        "sprite-1": {
          id: "sprite-1",
          type: "image",
          name: "Hero Idle",
          fileId: "file-1",
          tagIds: ["tag-idle"],
          resolvedTags: [{ id: "tag-idle", name: "Idle" }],
        },
        "sprite-2": {
          id: "sprite-2",
          type: "image",
          name: "Hero Attack",
          fileId: "file-2",
          tagIds: ["tag-attack"],
          resolvedTags: [{ id: "tag-attack", name: "Attack" }],
        },
      },
    };

    setActiveTagIds(
      { state },
      {
        tagIds: ["tag-idle"],
      },
    );

    const filteredViewData = selectViewData({ state });
    expect(
      filteredViewData.mediaGroups[0].children.map((child) => child.id),
    ).toEqual(["sprite-1"]);

    setActiveTagIds(
      { state },
      {
        tagIds: ["tag-idle", "tag-attack"],
      },
    );

    const orFilteredViewData = selectViewData({ state });
    expect(
      orFilteredViewData.mediaGroups[0].children.map((child) => child.id),
    ).toEqual(["sprite-1", "sprite-2"]);

    state.searchQuery = "attack";
    const searchViewData = selectViewData({ state });
    expect(
      searchViewData.mediaGroups[0].children.map((child) => child.id),
    ).toEqual(["sprite-2"]);

    setActiveTagIds(
      { state },
      {
        tagIds: [],
      },
    );

    const searchOnlyViewData = selectViewData({ state });
    expect(
      searchOnlyViewData.mediaGroups[0].children.map((child) => child.id),
    ).toEqual(["sprite-2"]);
  });

  it("provides tag labels to the edit form tag selector", () => {
    const state = createInitialState();
    state.tagsData = {
      tree: [{ id: "tag-idle" }],
      items: {
        "tag-idle": {
          id: "tag-idle",
          type: "tag",
          name: "Idle",
        },
      },
    };

    const viewData = selectViewData({ state });

    expect(viewData.editForm.fields[2]).toMatchObject({
      name: "tagIds",
      type: "tag-select",
      options: [
        {
          label: "Idle",
          value: "tag-idle",
        },
      ],
    });
  });

  it("uses the original file and exposes adjacent controls for the full preview overlay", () => {
    const state = createInitialState();
    state.characterName = "Hero";
    state.spritesData = {
      tree: [
        {
          id: "folder-1",
          children: [
            { id: "sprite-1" },
            { id: "sprite-2" },
            { id: "sprite-3" },
          ],
        },
      ],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Main",
        },
        "sprite-1": {
          id: "sprite-1",
          type: "image",
          name: "Hero Idle",
          fileId: "file-1",
        },
        "sprite-2": {
          id: "sprite-2",
          type: "image",
          name: "Hero Smile",
          fileId: "original-file",
          thumbnailFileId: "thumbnail-file",
          width: 48,
          height: 48,
        },
        "sprite-3": {
          id: "sprite-3",
          type: "image",
          name: "Hero Sad",
          fileId: "file-3",
        },
      },
    };

    setSelectedItemId(
      { state },
      {
        itemId: "sprite-2",
      },
    );
    showFullImagePreview(
      { state },
      {
        itemId: "sprite-2",
      },
    );

    const viewData = selectViewData({ state });
    expect(state.fullImagePreviewVisible).toBe(true);
    expect(state.fullImagePreviewFileId).toBe("original-file");
    expect(viewData.fullImagePreviewFrameStyle).toContain(
      "aspect-ratio: 1920 / 1080",
    );
    expect(viewData.fullImagePreviewFrameStyle).toContain(
      "width: min(92vw, calc(92vh * (1920 / 1080)))",
    );
    expect(viewData.fullImagePreviewImageWrapperStyle).toContain("width: 2.5%");
    expect(viewData.fullImagePreviewImageWrapperStyle).toContain(
      "height: 4.444444444444445%",
    );
    expect(viewData.fullImagePreviewCanvasModeButton.selected).toBe(true);
    expect(viewData.fullImagePreviewFitModeButton.selected).toBe(false);
    expect(viewData.fullImagePreviewPreviousVisible).toBe(true);
    expect(viewData.fullImagePreviewNextVisible).toBe(true);
  });

  it("uses project resolution for full sprite preview sizing and sets mode", () => {
    const state = createInitialState();
    state.characterName = "Hero";
    state.spritesData = {
      tree: [
        {
          id: "folder-1",
          children: [{ id: "sprite-1" }],
        },
      ],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Main",
        },
        "sprite-1": {
          id: "sprite-1",
          type: "image",
          name: "Hero Icon",
          fileId: "sprite-file",
          width: 54,
          height: 96,
        },
      },
    };

    setProjectResolution(
      { state },
      {
        projectResolution: {
          width: 1080,
          height: 1920,
        },
      },
    );
    setSelectedItemId(
      { state },
      {
        itemId: "sprite-1",
      },
    );
    showFullImagePreview(
      { state },
      {
        itemId: "sprite-1",
      },
    );

    const canvasViewData = selectViewData({ state });
    expect(canvasViewData.fullImagePreviewFrameStyle).toContain(
      "aspect-ratio: 1080 / 1920",
    );
    expect(canvasViewData.fullImagePreviewImageWrapperStyle).toContain(
      "width: 5%",
    );
    expect(canvasViewData.fullImagePreviewImageWrapperStyle).toContain(
      "height: 5%",
    );

    setFullImagePreviewDisplayMode(
      { state },
      {
        displayMode: "fit",
      },
    );

    const fitViewData = selectViewData({ state });
    expect(state.fullImagePreviewDisplayMode).toBe("fit");
    expect(fitViewData.fullImagePreviewImageWrapperStyle).toBe(
      "position: absolute; inset: 0;",
    );
    expect(fitViewData.fullImagePreviewCanvasModeButton.selected).toBe(false);
    expect(fitViewData.fullImagePreviewFitModeButton.selected).toBe(true);

    setFullImagePreviewDisplayMode(
      { state },
      {
        displayMode: "canvas",
      },
    );
    expect(state.fullImagePreviewDisplayMode).toBe("canvas");
  });

  it("jumps adjacent sprite selection by distance and clamps to visible bounds", () => {
    const state = createInitialState();
    state.characterName = "Hero";
    state.spritesData = {
      tree: [
        {
          id: "folder-1",
          children: [
            { id: "sprite-1" },
            { id: "sprite-2" },
            { id: "sprite-3" },
            { id: "sprite-4" },
            { id: "sprite-5" },
          ],
        },
      ],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Main",
        },
        "sprite-1": {
          id: "sprite-1",
          type: "image",
          name: "Hero 1",
        },
        "sprite-2": {
          id: "sprite-2",
          type: "image",
          name: "Hero 2",
        },
        "sprite-3": {
          id: "sprite-3",
          type: "image",
          name: "Hero 3",
        },
        "sprite-4": {
          id: "sprite-4",
          type: "image",
          name: "Hero 4",
        },
        "sprite-5": {
          id: "sprite-5",
          type: "image",
          name: "Hero 5",
        },
      },
    };

    expect(
      selectAdjacentSpriteItemId(
        { state },
        {
          itemId: "sprite-2",
          direction: "next",
          distance: 10,
          clamp: true,
        },
      ),
    ).toBe("sprite-5");
    expect(
      selectAdjacentSpriteItemId(
        { state },
        {
          itemId: "sprite-2",
          direction: "previous",
          distance: 10,
          clamp: true,
        },
      ),
    ).toBe("sprite-1");
    expect(
      selectAdjacentSpriteItemId(
        { state },
        {
          itemId: "sprite-5",
          direction: "next",
        },
      ),
    ).toBeUndefined();
  });
});
