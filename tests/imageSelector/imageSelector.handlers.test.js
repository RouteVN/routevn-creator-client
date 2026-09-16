import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleOnUpdate,
  handleImageItemClick,
  handleImageItemDoubleClick,
  handleImageItemKeyDown,
} from "../../src/components/imageSelector/imageSelector.handlers.js";

const createPayload = (imageId) => ({
  _event: {
    currentTarget: {
      dataset: {
        itemId: imageId,
      },
    },
  },
});

describe("imageSelector.handlers", () => {
  it("switches resource sources and clears the previous selection on prop updates", () => {
    const images = {
      items: { folder: { id: "folder", type: "folder", name: "Images" } },
      tree: [{ id: "folder" }],
    };
    const deps = {
      store: { setImages: vi.fn(), setSelectedImageId: vi.fn() },
      projectService: { getRepositoryState: () => ({ images }) },
      props: { resourceTarget: "images" },
      render: vi.fn(),
    };
    handleAfterMount(deps);
    expect(deps.store.setImages).toHaveBeenLastCalledWith({ images });
    handleOnUpdate(deps, {
      oldProps: { resourceTarget: "images", selectedImageId: "image-1" },
      newProps: { resourceTarget: "characterSprites" },
    });
    expect(deps.store.setImages).toHaveBeenLastCalledWith({
      images: { items: {}, tree: [] },
    });
    expect(deps.store.setSelectedImageId).toHaveBeenLastCalledWith({
      imageId: undefined,
    });
    handleOnUpdate(deps, {
      oldProps: { resourceTarget: "characterSprites" },
      newProps: { resourceTarget: "images" },
    });
    expect(deps.store.setImages).toHaveBeenLastCalledWith({ images });
  });

  it("selects images on click", () => {
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const setSelectedImageId = vi.fn();

    handleImageItemClick(
      {
        dispatchEvent,
        render,
        store: {
          setSelectedImageId,
        },
      },
      createPayload("image-1"),
    );

    expect(setSelectedImageId).toHaveBeenCalledWith({
      imageId: "image-1",
    });
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "image-selected",
      detail: {
        imageId: "image-1",
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not emit a double-click event", () => {
    const dispatchEvent = vi.fn();

    handleImageItemDoubleClick(
      {
        dispatchEvent,
      },
      createPayload("image-1"),
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it.each(["Enter", " "])("selects images with the %s key", (key) => {
    const dispatchEvent = vi.fn();
    const preventDefault = vi.fn();
    const render = vi.fn();
    const setSelectedImageId = vi.fn();
    const payload = createPayload("image-1");
    payload._event.key = key;
    payload._event.preventDefault = preventDefault;

    handleImageItemKeyDown(
      {
        dispatchEvent,
        render,
        store: {
          setSelectedImageId,
        },
      },
      payload,
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setSelectedImageId).toHaveBeenCalledWith({
      imageId: "image-1",
    });
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "image-selected",
      detail: {
        imageId: "image-1",
      },
    });
  });

  it("moves focus between image options with arrow keys", () => {
    const previousItem = { focus: vi.fn() };
    const currentItem = { focus: vi.fn() };
    const nextItem = { focus: vi.fn() };
    const preventDefault = vi.fn();

    handleImageItemKeyDown(
      {
        refs: {
          container: {
            querySelectorAll: vi.fn(() => [
              previousItem,
              currentItem,
              nextItem,
            ]),
          },
        },
      },
      {
        _event: {
          currentTarget: currentItem,
          key: "ArrowRight",
          preventDefault,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(nextItem.focus).toHaveBeenCalledTimes(1);
  });
});
