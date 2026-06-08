import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handlePreviewCanvasModeClick,
  handlePreviewFitModeClick,
  handlePreviewNextClick,
  handlePreviewOverlayKeyDown,
  handlePreviewPreviousClick,
} from "../../src/pages/characterSprites/characterSprites.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createPreviewDeps = ({
  selectedItemId = "sprite-1",
  previewVisible = true,
} = {}) => {
  const store = {
    selectFullImagePreviewVisible: vi.fn(() => previewVisible),
    selectSelectedItemId: vi.fn(() => selectedItemId),
    selectAdjacentSpriteItemId: vi.fn(({ direction }) => {
      return direction === "next" ? "sprite-2" : "sprite-0";
    }),
    selectSpriteItemById: vi.fn(({ itemId }) => ({
      id: itemId,
      type: "image",
      fileId: `${itemId}-file`,
    })),
    setSelectedItemId: vi.fn(),
    showFullImagePreview: vi.fn(),
    setFullImagePreviewDisplayMode: vi.fn(),
  };

  return {
    store,
    render: vi.fn(),
    refs: {
      fileExplorer: {
        selectItem: vi.fn(),
      },
      groupview: {
        scrollItemIntoView: vi.fn(),
      },
      previewOverlay: {
        focus: vi.fn(),
      },
    },
  };
};

const createEvent = (key, overrides = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...overrides,
});

describe("characterSprites preview handlers", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("navigates preview items from the left and right overlay edges", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();
    const nextEvent = createEvent("click");
    const previousEvent = createEvent("click");

    handlePreviewNextClick(deps, {
      _event: nextEvent,
    });
    handlePreviewPreviousClick(deps, {
      _event: previousEvent,
    });

    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(1, {
      itemId: "sprite-1",
      direction: "next",
    });
    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(2, {
      itemId: "sprite-1",
      direction: "previous",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "sprite-2",
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "sprite-0",
    });
    expect(nextEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(nextEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(previousEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(previousEvent.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("uses vertical keys to navigate preview items and ignores text entry targets", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();

    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowDown"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowUp"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("d", {
        ctrlKey: true,
      }),
    });

    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(1, {
      itemId: "sprite-1",
      direction: "next",
    });
    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(2, {
      itemId: "sprite-1",
      direction: "previous",
    });
    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenNthCalledWith(3, {
      itemId: "sprite-1",
      direction: "next",
      distance: 10,
      clamp: true,
    });

    const inputEvent = createEvent("ArrowRight", {
      target: {
        tagName: "INPUT",
      },
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: inputEvent,
    });

    expect(deps.store.selectAdjacentSpriteItemId).toHaveBeenCalledTimes(3);
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(inputEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("switches full sprite preview display modes from the overlay controls", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();
    const canvasEvent = createEvent("click");
    const fitEvent = createEvent("click");

    handlePreviewCanvasModeClick(deps, {
      _event: canvasEvent,
    });
    handlePreviewFitModeClick(deps, {
      _event: fitEvent,
    });

    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      1,
      {
        displayMode: "canvas",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      2,
      {
        displayMode: "fit",
      },
    );
    expect(canvasEvent.preventDefault).toHaveBeenCalledOnce();
    expect(canvasEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(fitEvent.preventDefault).toHaveBeenCalledOnce();
    expect(fitEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(2);
  });

  it("uses horizontal keys to switch full sprite preview display modes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
    const deps = createPreviewDeps();

    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowLeft"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("ArrowRight"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("h"),
    });
    handlePreviewOverlayKeyDown(deps, {
      _event: createEvent("l"),
    });

    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      1,
      {
        displayMode: "canvas",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      2,
      {
        displayMode: "fit",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      3,
      {
        displayMode: "canvas",
      },
    );
    expect(deps.store.setFullImagePreviewDisplayMode).toHaveBeenNthCalledWith(
      4,
      {
        displayMode: "fit",
      },
    );
    expect(deps.render).toHaveBeenCalledTimes(4);
    expect(deps.refs.previewOverlay.focus).toHaveBeenCalledTimes(4);
    expect(deps.store.selectAdjacentSpriteItemId).not.toHaveBeenCalled();
  });

  it("does not use tab as a full sprite preview shortcut", () => {
    const deps = createPreviewDeps();
    const event = createEvent("Tab");

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(deps.store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.refs.previewOverlay.focus).not.toHaveBeenCalled();
    expect(deps.store.selectAdjacentSpriteItemId).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("does not navigate when the preview is hidden", () => {
    const deps = createPreviewDeps({
      previewVisible: false,
    });
    const event = createEvent("ArrowRight");

    handlePreviewOverlayKeyDown(deps, {
      _event: event,
    });

    expect(deps.store.selectSelectedItemId).not.toHaveBeenCalled();
    expect(deps.store.selectAdjacentSpriteItemId).not.toHaveBeenCalled();
    expect(deps.store.setFullImagePreviewDisplayMode).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
