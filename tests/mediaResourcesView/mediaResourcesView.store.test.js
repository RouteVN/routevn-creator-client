import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSoundWaveformRenderedItemCount,
} from "../../src/components/mediaResourcesView/mediaResourcesView.store.js";

describe("mediaResourcesView.store", () => {
  it("does not show a strong hover border on non-selected cards while another card is selected", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        selectedItemId: "sprite-1",
        groups: [
          {
            id: "folder-1",
            children: [
              { id: "sprite-1", cardKind: "image" },
              { id: "sprite-2", cardKind: "image" },
            ],
          },
        ],
      },
    });

    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemBorderColor: "pr",
        itemHoverBorderColor: "pr",
      }),
    );
    expect(viewData.groups[0].children[1]).toEqual(
      expect.objectContaining({
        itemBorderColor: "bo",
        itemHoverBorderColor: "bo",
      }),
    );
  });

  it("keeps the hover border for interactive cards when nothing is selected", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        groups: [
          {
            id: "folder-1",
            children: [{ id: "sprite-1", cardKind: "image" }],
          },
        ],
      },
    });

    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemBorderColor: "bo",
        itemHoverBorderColor: "ac",
      }),
    );
  });

  it("allows column zoom controls to drive mobile image grid columns", () => {
    const props = {
      mobileLayout: true,
      showZoomControls: true,
      zoomInPopover: true,
      zoomControlMode: "columns",
      groups: [
        {
          id: "folder-1",
          children: [{ id: "image-1", cardKind: "image" }],
        },
      ],
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({
      state,
      props,
    });

    expect(viewData.showZoomPopoverButton).toBe(true);
    expect(viewData.itemsPerRow).toBe(2);
    expect(viewData.cardGridColumns).toBe("2");
    expect(viewData.zoomControlMax).toBe(6);
    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        itemContainerStyle: "width: 100%; box-sizing: border-box;",
        imageCardWidth: "f",
      }),
    );
  });

  it("clamps mobile column zoom controls to six columns", () => {
    const props = {
      mobileLayout: true,
      showZoomControls: true,
      zoomControlMode: "columns",
      defaultItemsPerRow: 9,
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(state.itemsPerRow).toBe(6);
    expect(viewData.itemsPerRow).toBe(6);
    expect(viewData.cardGridColumns).toBe("6");
    expect(viewData.zoomControlMax).toBe(6);
  });

  it("reserves placeholder cards before progressive hydration", () => {
    const props = {
      progressiveRender: true,
      progressiveInitialItemCount: 0,
      groups: [
        {
          id: "folder-1",
          children: [
            { id: "sound-1", cardKind: "sound" },
            { id: "sound-2", cardKind: "sound" },
            { id: "sound-3", cardKind: "sound" },
            { id: "sound-4", cardKind: "sound" },
          ],
        },
      ],
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(viewData.groups[0].children).toHaveLength(4);
    expect(viewData.groups[0].children).toEqual([
      expect.objectContaining({
        isPlaceholder: true,
        domItemId: "",
        cursor: "default",
      }),
      expect.objectContaining({ isPlaceholder: true }),
      expect.objectContaining({ isPlaceholder: true }),
      expect.objectContaining({ isPlaceholder: true }),
    ]);
  });

  it("caps initial placeholders for large progressive groups", () => {
    const props = {
      progressiveRender: true,
      progressiveInitialItemCount: 0,
      groups: [
        {
          id: "folder-1",
          children: Array.from({ length: 40 }, (_, index) => ({
            id: `sound-${index}`,
            cardKind: "sound",
          })),
        },
      ],
    };
    const state = createInitialState({ props });
    const viewData = selectViewData({ state, props });

    expect(viewData.groups[0].children).toHaveLength(12);
    expect(
      viewData.groups[0].children.every((item) => item.isPlaceholder === true),
    ).toBe(true);
    expect(viewData.groups[0].progressiveContentMinHeight).toBeGreaterThan(0);
  });

  it("renders sound waveforms immediately by default", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        groups: [
          {
            id: "folder-1",
            children: [
              {
                id: "sound-1",
                cardKind: "sound",
                waveformDataFileId: "waveform-1",
              },
            ],
          },
        ],
      },
    });

    expect(viewData.groups[0].children[0]).toEqual(
      expect.objectContaining({
        shouldRenderWaveform: true,
      }),
    );
  });

  it("defers sound waveforms when lazy waveform rendering is enabled", () => {
    const state = createInitialState();
    const props = {
      lazySoundWaveforms: true,
      groups: [
        {
          id: "folder-1",
          children: [
            {
              id: "sound-1",
              cardKind: "sound",
              waveformDataFileId: "waveform-1",
            },
            {
              id: "sound-2",
              cardKind: "sound",
              waveformDataFileId: "waveform-2",
            },
          ],
        },
      ],
    };

    const initialViewData = selectViewData({ state, props });
    expect(
      initialViewData.groups[0].children.map(
        (item) => item.shouldRenderWaveform,
      ),
    ).toEqual([false, false]);

    setSoundWaveformRenderedItemCount(
      { state },
      {
        itemCount: 1,
      },
    );
    const hydratedViewData = selectViewData({ state, props });

    expect(
      hydratedViewData.groups[0].children.map(
        (item) => item.shouldRenderWaveform,
      ),
    ).toEqual([true, false]);
  });
});
