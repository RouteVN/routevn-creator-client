import { describe, expect, it, vi } from "vitest";
import {
  handleImageItemClick,
  handleImageItemDoubleClick,
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
});
