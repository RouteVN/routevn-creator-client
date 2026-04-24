import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectSoundOptions,
  setSoundsData,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleSectionActionClick } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

const SOUNDS_DATA = {
  items: {
    "sound-hover": {
      id: "sound-hover",
      type: "sound",
      name: "Hover Sound",
      fileId: "file-hover",
    },
  },
  tree: [{ id: "sound-hover" }],
};

const createDeps = ({ soundsData = SOUNDS_DATA } = {}) => {
  const state = createInitialState();

  setValues(
    { state },
    {
      values: {
        type: "text",
        text: "Hello",
      },
    },
  );
  setSoundsData(
    { state },
    {
      soundsData,
    },
  );

  return {
    state,
    store: {
      selectValues: () => state.values,
      selectSoundOptions: () => selectSoundOptions({ state }),
      updateValueProperty: (payload) => updateValueProperty({ state }, payload),
    },
    appService: {
      showDropdownMenu: vi.fn(),
      showAlert: vi.fn(),
    },
    refs: {},
    props: {},
    render: vi.fn(),
    dispatchEvent: vi.fn(),
  };
};

describe("layoutEditPanel sound handlers", () => {
  it("applies the selected hover sound variant", async () => {
    const deps = createDeps();
    deps.appService.showDropdownMenu
      .mockResolvedValueOnce({ item: { key: "hoverSoundId" } })
      .mockResolvedValueOnce({ item: { key: "sound-hover" } });

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "sounds",
          },
        },
      },
    });

    expect(deps.state.values.hoverSoundId).toBe("sound-hover");
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "hoverSoundId",
      value: "sound-hover",
    });
  });

  it("shows an alert when no sounds are available", async () => {
    const deps = createDeps({
      soundsData: {
        items: {},
        tree: [],
      },
    });
    deps.appService.showDropdownMenu.mockResolvedValueOnce({
      item: { key: "hoverSoundId" },
    });

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "sounds",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "No sounds available. Create a sound resource first.",
      title: "Warning",
    });
  });
});
