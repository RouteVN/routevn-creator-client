import { describe, expect, it, vi } from "vitest";
import { handleSoundItemClick } from "../../src/components/soundSelector/soundSelector.handlers.js";

const createPayload = (soundId) => ({
  _event: {
    currentTarget: {
      dataset: {
        itemId: soundId,
      },
    },
  },
});

describe("soundSelector.handlers", () => {
  it("selects sounds on click", () => {
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const setSelectedSoundId = vi.fn();

    handleSoundItemClick(
      {
        dispatchEvent,
        render,
        store: {
          setSelectedSoundId,
        },
      },
      createPayload("sound-1"),
    );

    expect(setSelectedSoundId).toHaveBeenCalledWith({
      soundId: "sound-1",
    });
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "sound-selected",
      detail: {
        soundId: "sound-1",
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
