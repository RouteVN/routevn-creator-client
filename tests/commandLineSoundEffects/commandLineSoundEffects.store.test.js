import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setExistingSfxs,
} from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js";

describe("commandLineSoundEffects.store", () => {
  it("normalizes legacy 0 to 1000 sound effect volume values into the 0 to 100 UI range", () => {
    const state = createInitialState();

    setExistingSfxs(
      { state },
      {
        sfx: [
          {
            id: "sfx-1",
            resourceId: "sound-1",
            volume: 500,
          },
        ],
      },
    );

    expect(selectViewData({ state }).defaultValues.sfx).toEqual([
      expect.objectContaining({
        id: "sfx-1",
        volume: 50,
      }),
    ]);
  });
});
