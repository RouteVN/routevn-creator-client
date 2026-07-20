import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  closeSoundSelectorDialog,
  openSoundSelectorDialog,
  selectSoundSelectorDialog,
  selectSoundOptions,
  selectTempSelectedSoundId,
  setSoundsData,
  setTempSelectedSoundId,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleOptionSelected,
  handleSectionActionClick,
  handleSoundSelectorSubmit,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import { EN_I18N } from "../support/i18n.js";

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

const createDeps = ({ soundsData = SOUNDS_DATA, itemType = "text" } = {}) => {
  const state = createInitialState();

  setValues(
    { state },
    {
      values: {
        type: itemType,
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
      selectSoundSelectorDialog: () => selectSoundSelectorDialog({ state }),
      selectTempSelectedSoundId: () => selectTempSelectedSoundId({ state }),
      setTempSelectedSoundId: (payload) =>
        setTempSelectedSoundId({ state }, payload),
      openSoundSelectorDialog: (payload) =>
        openSoundSelectorDialog({ state }, payload),
      closeSoundSelectorDialog: (payload) =>
        closeSoundSelectorDialog({ state }, payload),
      updateValueProperty: (payload) => updateValueProperty({ state }, payload),
      closePopoverForm: vi.fn(),
    },
    appService: {
      showDropdownMenu: vi.fn(),
      showAlert: vi.fn(),
    },
    refs: {},
    props: {
      itemType,
    },
    i18n: EN_I18N,
    render: vi.fn(),
    dispatchEvent: vi.fn(),
  };
};

describe("layoutEditPanel sound handlers", () => {
  it("opens the sound selector for the selected hover sound variant", async () => {
    const deps = createDeps();
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

    expect(deps.state.soundSelectorDialog).toMatchObject({
      open: true,
      name: "hoverSoundId",
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.appService.showDropdownMenu).toHaveBeenCalledTimes(1);
  });

  it("opens the sound selector for the selected text reveal sound variant", async () => {
    const deps = createDeps({
      itemType: "text-revealing",
    });

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "textRevealing",
          },
        },
      },
    });

    expect(deps.appService.showDropdownMenu).not.toHaveBeenCalled();
    expect(deps.state.soundSelectorDialog).toMatchObject({
      open: true,
      name: "revealSoundId",
    });
  });

  it("shows an alert when no reveal sounds are available", async () => {
    const deps = createDeps({
      itemType: "text-revealing",
      soundsData: {
        items: {},
        tree: [],
      },
    });

    await handleSectionActionClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            id: "textRevealing",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "No sounds available. Create a sound resource first.",
      title: "Warning",
    });
    expect(deps.state.soundSelectorDialog.open).toBe(false);
  });

  it("applies the submitted hover sound selection", () => {
    const deps = createDeps();
    deps.store.openSoundSelectorDialog({
      name: "hoverSoundId",
    });
    deps.store.setTempSelectedSoundId({
      soundId: "sound-hover",
    });

    handleSoundSelectorSubmit(deps);

    expect(deps.state.values.hoverSoundId).toBe("sound-hover");
    expect(deps.state.soundSelectorDialog.open).toBe(false);
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "hoverSoundId",
      value: "sound-hover",
    });
  });

  it("clears the selected hover sound when None is selected", () => {
    const deps = createDeps();
    deps.state.values.hoverSoundId = "sound-hover";

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "hoverSoundId",
          },
        },
        detail: {
          item: {
            value: "",
          },
        },
      },
    });

    expect(deps.state.values).not.toHaveProperty("hoverSoundId");
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "hoverSoundId",
      value: undefined,
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
