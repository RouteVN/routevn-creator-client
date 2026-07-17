import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleItemContextMenu,
  handleItemDoubleClick,
  handleTagFilterButtonClick,
  handleZoomButtonClick,
  handleZoomOut,
} from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";

const createMobileColumnZoomProps = () => ({
  mobileLayout: true,
  showZoomControls: true,
  zoomControlMode: "columns",
  itemsPerRowConfigKey: "groupImagesView.itemsPerRow",
});

describe("mediaResourcesView.handlers", () => {
  it.each([
    ["filter", handleTagFilterButtonClick, "openTagFilterPopover"],
    ["zoom", handleZoomButtonClick, "openZoomPopover"],
  ])(
    "anchors the %s popover below the button and aligns it to the left",
    (_label, handler, storeMethod) => {
      const openPopover = vi.fn();
      const stopPropagation = vi.fn();
      const deps = {
        props: {
          selectedTagFilterValues: [],
        },
        refs: {
          tagFilterButton: {
            getBoundingClientRect: () => ({ right: 940, bottom: 48 }),
          },
          zoomButton: {
            getBoundingClientRect: () => ({ right: 940, bottom: 48 }),
          },
        },
        store: {
          [storeMethod]: openPopover,
        },
        render: vi.fn(),
      };

      handler(deps, {
        _event: {
          stopPropagation,
        },
      });

      expect(openPopover).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { x: 940, y: 48 },
        }),
      );
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(deps.render).toHaveBeenCalledOnce();
    },
  );

  it("ignores mobile item double clicks", () => {
    const dispatchEvent = vi.fn();

    handleItemDoubleClick(
      {
        props: {
          mobileLayout: true,
        },
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
        },
      },
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("keeps desktop item double clicks", () => {
    const dispatchEvent = vi.fn();

    handleItemDoubleClick(
      {
        props: {
          mobileLayout: false,
        },
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "image-1",
        },
      }),
    );
  });

  it("runs the double-click action instead of opening the context menu for mobile contextmenu gestures", () => {
    const dispatchEvent = vi.fn();
    const preventDefault = vi.fn();
    const showContextMenu = vi.fn();
    const render = vi.fn();

    handleItemContextMenu(
      {
        props: {
          mobileLayout: true,
        },
        dispatchEvent,
        store: {
          showContextMenu,
        },
        render,
      },
      {
        _event: {
          preventDefault,
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-dblclick",
        detail: {
          itemId: "image-1",
          source: "mobile-context-menu",
        },
      }),
    );
    expect(showContextMenu).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("keeps the context menu on desktop contextmenu gestures", () => {
    const showContextMenu = vi.fn();
    const render = vi.fn();

    handleItemContextMenu(
      {
        props: {
          mobileLayout: false,
        },
        dispatchEvent: vi.fn(),
        store: {
          showContextMenu,
        },
        render,
      },
      {
        _event: {
          preventDefault: vi.fn(),
          currentTarget: {
            getAttribute: vi.fn((name) =>
              name === "data-item-id" ? "image-1" : undefined,
            ),
          },
          clientX: 10,
          clientY: 20,
        },
      },
    );

    expect(showContextMenu).toHaveBeenCalledWith({
      itemId: "image-1",
      x: 10,
      y: 20,
    });
    expect(render).toHaveBeenCalled();
  });

  it("clamps restored mobile column counts to six", () => {
    const setItemsPerRow = vi.fn();
    const getUserConfig = vi.fn((key) =>
      key === "groupImagesView.mobileItemsPerRow" ? 12 : undefined,
    );

    handleBeforeMount({
      props: createMobileColumnZoomProps(),
      appService: {
        getUserConfig,
      },
      store: {
        setItemsPerRow,
        selectProgressiveFrameId: () => undefined,
        setProgressiveRenderSignature: vi.fn(),
        setProgressiveRenderedItemCount: vi.fn(),
      },
    });

    expect(getUserConfig).toHaveBeenCalledWith(
      "groupImagesView.mobileItemsPerRow",
    );
    expect(getUserConfig).not.toHaveBeenCalledWith(
      "groupImagesView.itemsPerRow",
    );
    expect(setItemsPerRow).toHaveBeenCalledWith({ itemsPerRow: 6 });
  });

  it("does not persist mobile column counts above six", () => {
    let itemsPerRow = 6;
    const setUserConfig = vi.fn();
    const render = vi.fn();

    const handled = handleZoomOut({
      props: createMobileColumnZoomProps(),
      appService: {
        setUserConfig,
      },
      store: {
        selectItemsPerRow: () => itemsPerRow,
        setItemsPerRow: ({ itemsPerRow: nextItemsPerRow }) => {
          itemsPerRow = nextItemsPerRow;
        },
      },
      render,
    });

    expect(handled).toBe(true);
    expect(itemsPerRow).toBe(6);
    expect(setUserConfig).toHaveBeenCalledWith(
      "groupImagesView.mobileItemsPerRow",
      6,
    );
    expect(render).toHaveBeenCalled();
  });

  it("hydrates lazy sound waveforms after the initial paint window", () => {
    const frameCallbacks = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    let renderedItemCount = 0;
    let renderSignature = "";
    let frameId;
    const render = vi.fn();

    try {
      handleBeforeMount({
        props: {
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
                {
                  id: "sound-3",
                  cardKind: "sound",
                  waveformDataFileId: "waveform-3",
                },
                {
                  id: "sound-4",
                  cardKind: "sound",
                  waveformDataFileId: "waveform-4",
                },
                {
                  id: "sound-5",
                  cardKind: "sound",
                  waveformDataFileId: "waveform-5",
                },
              ],
            },
          ],
        },
        store: {
          selectProgressiveFrameId: () => undefined,
          setProgressiveRenderSignature: vi.fn(),
          setProgressiveRenderedItemCount: vi.fn(),
          selectSoundWaveformFrameId: () => frameId,
          setSoundWaveformFrameId: ({ frameId: nextFrameId }) => {
            frameId = nextFrameId;
          },
          clearSoundWaveformFrameId: () => {
            frameId = undefined;
          },
          selectSoundWaveformRenderedItemCount: () => renderedItemCount,
          setSoundWaveformRenderedItemCount: ({ itemCount }) => {
            renderedItemCount = itemCount;
          },
          selectSoundWaveformRenderSignature: () => renderSignature,
          setSoundWaveformRenderSignature: ({ signature }) => {
            renderSignature = signature;
          },
        },
        render,
      });

      expect(renderedItemCount).toBe(0);
      expect(render).not.toHaveBeenCalled();

      for (let frameIndex = 0; frameIndex < 7; frameIndex += 1) {
        frameCallbacks.shift()();
        expect(renderedItemCount).toBe(0);
        expect(render).not.toHaveBeenCalled();
      }

      frameCallbacks.shift()();
      expect(renderedItemCount).toBe(4);
      expect(render).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
