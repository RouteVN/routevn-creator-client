import { describe, expect, it, vi } from "vitest";
import {
  closeSoundFormDialog,
  closeSoundSelectorDialog,
  createInitialState,
  openSoundFormDialog,
  openSoundSelectorDialog,
  selectSoundFormDialog,
  selectSoundOptions,
  selectSoundSelectorDialog,
  selectTempSelectedSoundId,
  setSoundFormDialogSoundId,
  setSoundFormDialogValidationErrors,
  setSoundsData,
  setTempSelectedSoundId,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleOptionSelected,
  handleSectionActionClick,
  handleSoundFormAction,
  handleSoundFormSoundFieldClick,
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

const createDeps = ({
  soundsData = SOUNDS_DATA,
  itemType = "text",
  values = {},
} = {}) => {
  const state = createInitialState();

  setValues(
    { state },
    {
      values: {
        type: itemType,
        text: "Hello",
        ...values,
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
      selectSoundFormDialog: () => selectSoundFormDialog({ state }),
      selectSoundSelectorDialog: () => selectSoundSelectorDialog({ state }),
      selectTempSelectedSoundId: () => selectTempSelectedSoundId({ state }),
      setTempSelectedSoundId: (payload) =>
        setTempSelectedSoundId({ state }, payload),
      setSoundFormDialogSoundId: (payload) =>
        setSoundFormDialogSoundId({ state }, payload),
      setSoundFormDialogValidationErrors: (payload) =>
        setSoundFormDialogValidationErrors({ state }, payload),
      openSoundFormDialog: (payload) => openSoundFormDialog({ state }, payload),
      closeSoundFormDialog: (payload) =>
        closeSoundFormDialog({ state }, payload),
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
  it("opens the sound form for the selected hover sound variant", async () => {
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

    expect(deps.state.soundFormDialog).toMatchObject({
      open: true,
      name: "hoverSoundId",
      volumeName: "hover.soundVolume",
      volume: 100,
    });
    expect(deps.state.soundSelectorDialog.open).toBe(false);
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("prefills an existing sound and volume when editing the row", () => {
    const deps = createDeps({
      values: {
        hoverSoundId: "sound-hover",
        hover: {
          soundVolume: 35,
        },
      },
    });

    deps.store.openSoundFormDialog({
      name: "hoverSoundId",
      volumeName: "hover.soundVolume",
    });

    expect(deps.state.soundFormDialog).toMatchObject({
      open: true,
      selectedSoundId: "sound-hover",
      volume: 35,
    });
  });

  it("opens the selector from the sound field without applying a value", () => {
    const deps = createDeps();
    deps.store.openSoundFormDialog({
      name: "hoverSoundId",
      volumeName: "hover.soundVolume",
    });

    handleSoundFormSoundFieldClick(deps);

    expect(deps.state.soundSelectorDialog).toMatchObject({
      open: true,
      name: "hoverSoundId",
      source: "soundForm",
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("returns the selected sound to the form", () => {
    const deps = createDeps();
    deps.store.openSoundFormDialog({
      name: "hoverSoundId",
      volumeName: "hover.soundVolume",
    });
    deps.store.openSoundSelectorDialog({
      name: "hoverSoundId",
      source: "soundForm",
    });
    deps.store.setTempSelectedSoundId({
      soundId: "sound-hover",
    });

    handleSoundSelectorSubmit(deps);

    expect(deps.state.soundFormDialog.selectedSoundId).toBe("sound-hover");
    expect(deps.state.soundSelectorDialog.open).toBe(false);
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("applies the submitted hover sound and volume", () => {
    const deps = createDeps();
    deps.store.openSoundFormDialog({
      name: "hoverSoundId",
      volumeName: "hover.soundVolume",
    });
    deps.store.setSoundFormDialogSoundId({
      soundId: "sound-hover",
    });

    handleSoundFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            volume: 65,
          },
        },
      },
    });

    expect(deps.state.values.hoverSoundId).toBe("sound-hover");
    expect(deps.state.values.hover.soundVolume).toBe(65);
    expect(deps.state.soundFormDialog.open).toBe(false);
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(
      deps.dispatchEvent.mock.calls.map(([event]) => event.detail),
    ).toEqual([
      expect.objectContaining({
        name: "hoverSoundId",
        value: "sound-hover",
      }),
      expect.objectContaining({
        name: "hover.soundVolume",
        value: 65,
      }),
    ]);
  });

  it("keeps the form open when a sound has not been selected", () => {
    const deps = createDeps();
    deps.store.openSoundFormDialog({
      name: "clickSoundId",
      volumeName: "click.soundVolume",
    });

    handleSoundFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            volume: 50,
          },
        },
      },
    });

    expect(deps.state.soundFormDialog.open).toBe(true);
    expect(deps.state.soundFormDialog.validationErrors.soundId).toBe(
      "Sound is required.",
    );
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("opens the selector directly for the text reveal sound variant", async () => {
    const deps = createDeps({
      itemType: "text-revealing",
    });
    deps.appService.showDropdownMenu.mockResolvedValueOnce({
      item: { key: "revealSoundId" },
    });

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "textRevealIndicator",
          },
        },
      },
    });

    expect(deps.state.soundSelectorDialog).toMatchObject({
      open: true,
      name: "revealSoundId",
      source: "value",
    });
    expect(deps.state.soundFormDialog.open).toBe(false);
  });

  it("clears the selected hover sound and its volume", () => {
    const deps = createDeps({
      values: {
        hoverSoundId: "sound-hover",
        hover: {
          soundVolume: 40,
        },
      },
    });

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
    expect(deps.state.values.hover).not.toHaveProperty("soundVolume");
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it("shows an alert when the form tries to select from no sounds", async () => {
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
    handleSoundFormSoundFieldClick(deps);

    expect(deps.state.soundFormDialog.open).toBe(true);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "No sounds available. Create a sound resource first.",
      title: "Warning",
    });
  });
});
