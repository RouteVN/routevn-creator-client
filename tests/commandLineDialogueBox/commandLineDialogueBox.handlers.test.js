import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleBeforeMount,
  handleFormChange,
  handleSubmitClick,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.handlers.js";
import {
  createInitialState,
  setCharacterName,
  setClearPage,
  setCustomCharacterName,
  setPersistCharacter,
  setSelectedCharacterId,
  setSelectedMode,
  setSelectedResource,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.store.js";

const layouts = [
  {
    id: "layout-adv",
    name: "ADV Layout",
    layoutType: "dialogue-adv",
  },
  {
    id: "layout-nvl",
    name: "NVL Layout",
    layoutType: "dialogue-nvl",
  },
];

const characters = [
  {
    id: "character-1",
    type: "character",
    name: "Aki",
  },
  {
    id: "character-2",
    type: "character",
    name: "Mina",
  },
];

const createStore = (state) => ({
  getState: () => state,
  setSelectedMode: (payload) => setSelectedMode({ state }, payload),
  setSelectedResource: (payload) => setSelectedResource({ state }, payload),
  setSelectedCharacterId: (payload) =>
    setSelectedCharacterId({ state }, payload),
  setCustomCharacterName: (payload) =>
    setCustomCharacterName({ state }, payload),
  setCharacterName: (payload) => setCharacterName({ state }, payload),
  setPersistCharacter: (payload) => setPersistCharacter({ state }, payload),
  setClearPage: (payload) => setClearPage({ state }, payload),
});

const createFormRefs = () => ({
  dialogueForm: {
    reset: vi.fn(),
    setValues: vi.fn(),
  },
});

describe("commandLineDialogueBox.handlers", () => {
  it("hydrates persistCharacter and custom character name from props into the form state", () => {
    const state = createInitialState();
    const reset = vi.fn();
    const setValues = vi.fn();

    const deps = {
      props: {
        layouts,
        characters,
        dialogue: {
          mode: "adv",
          ui: {
            resourceId: "layout-adv",
          },
          characterId: "character-1",
          character: {
            name: "Boss",
          },
          persistCharacter: true,
        },
      },
      refs: {
        dialogueForm: {
          reset,
          setValues,
        },
      },
      store: createStore(state),
    };

    handleBeforeMount(deps);
    handleAfterMount(deps);

    expect(state.persistCharacter).toBe(true);
    expect(state.customCharacterName).toBe(true);
    expect(state.characterName).toBe("Boss");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        customCharacterName: true,
        characterName: "Boss",
        persistCharacter: true,
      }),
    });
  });

  it("hydrates persistCharacter when only a custom character name is present", () => {
    const state = createInitialState();
    const reset = vi.fn();
    const setValues = vi.fn();

    const deps = {
      props: {
        layouts,
        characters,
        dialogue: {
          mode: "adv",
          ui: {
            resourceId: "layout-adv",
          },
          character: {
            name: "Boss",
          },
          persistCharacter: true,
        },
      },
      refs: {
        dialogueForm: {
          reset,
          setValues,
        },
      },
      store: createStore(state),
    };

    handleBeforeMount(deps);
    handleAfterMount(deps);

    expect(state.selectedCharacterId).toBe("");
    expect(state.customCharacterName).toBe(true);
    expect(state.persistCharacter).toBe(true);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        customCharacterName: true,
        characterName: "Boss",
        persistCharacter: true,
      }),
    });
  });

  it("clears persistCharacter from props when no character is selected", () => {
    const state = createInitialState();
    const reset = vi.fn();
    const setValues = vi.fn();

    const deps = {
      props: {
        layouts,
        characters,
        dialogue: {
          mode: "adv",
          ui: {
            resourceId: "layout-adv",
          },
          persistCharacter: true,
        },
      },
      refs: {
        dialogueForm: {
          reset,
          setValues,
        },
      },
      store: createStore(state),
    };

    handleBeforeMount(deps);
    handleAfterMount(deps);

    expect(state.selectedCharacterId).toBe("");
    expect(state.persistCharacter).toBe(false);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        characterId: "",
        persistCharacter: false,
      }),
    });
  });

  it("tracks persistCharacter changes from the form payload after the field is visible", () => {
    const state = createInitialState();
    const render = vi.fn();
    const refs = createFormRefs();

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-1",
              customCharacterName: false,
              characterName: "",
              persistCharacter: false,
              clearPage: false,
            },
          },
        },
      },
    );

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-1",
              customCharacterName: false,
              characterName: "Aki",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.persistCharacter).toBe(true);
    expect(state.characterName).toBe("Aki");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("resets persistCharacter to false when selecting a character makes the field appear", () => {
    const state = createInitialState();
    const render = vi.fn();
    const reset = vi.fn();
    const setValues = vi.fn();

    setPersistCharacter({ state }, { persistCharacter: true });

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs: {
          dialogueForm: {
            reset,
            setValues,
          },
        },
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-1",
              customCharacterName: false,
              characterName: "",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.selectedCharacterId).toBe("character-1");
    expect(state.persistCharacter).toBe(false);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        characterId: "character-1",
        persistCharacter: false,
      }),
    });
  });

  it("clears persistCharacter when the selected character is removed", () => {
    const state = createInitialState();
    const render = vi.fn();
    const refs = createFormRefs();

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-1",
              customCharacterName: false,
              characterName: "",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "",
              customCharacterName: false,
              characterName: "",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.selectedCharacterId).toBe("");
    expect(state.persistCharacter).toBe(false);
  });

  it("shows persistCharacter for custom names and keeps it enabled", () => {
    const state = createInitialState();
    const render = vi.fn();
    const reset = vi.fn();
    const setValues = vi.fn();

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs: {
          dialogueForm: {
            reset,
            setValues,
          },
        },
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "",
              customCharacterName: true,
              characterName: "Boss",
              persistCharacter: false,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.customCharacterName).toBe(true);
    expect(state.persistCharacter).toBe(false);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        customCharacterName: true,
        persistCharacter: false,
      }),
    });

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs: {
          dialogueForm: {
            reset,
            setValues,
          },
        },
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "",
              customCharacterName: true,
              characterName: "Boss",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.persistCharacter).toBe(true);
  });

  it("resets persistCharacter when custom naming makes the field appear without a name", () => {
    const state = createInitialState();
    const render = vi.fn();
    const reset = vi.fn();
    const setValues = vi.fn();

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs: {
          dialogueForm: {
            reset,
            setValues,
          },
        },
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "",
              customCharacterName: true,
              characterName: "",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.customCharacterName).toBe(true);
    expect(state.characterName).toBe("");
    expect(state.persistCharacter).toBe(false);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        customCharacterName: true,
        characterName: "",
        persistCharacter: false,
      }),
    });
  });

  it("keeps persistCharacter when a custom character name is removed but custom naming stays enabled", () => {
    const state = createInitialState();
    const render = vi.fn();
    const reset = vi.fn();
    const setValues = vi.fn();

    setCustomCharacterName({ state }, { customCharacterName: true });
    setCharacterName({ state }, { characterName: "Boss" });
    setPersistCharacter({ state }, { persistCharacter: true });

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs: {
          dialogueForm: {
            reset,
            setValues,
          },
        },
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "",
              customCharacterName: true,
              characterName: "",
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.customCharacterName).toBe(true);
    expect(state.characterName).toBe("");
    expect(state.persistCharacter).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    expect(setValues).not.toHaveBeenCalled();
  });

  it("keeps the custom character name when switching characters with custom naming on", () => {
    const state = createInitialState();
    const render = vi.fn();
    const refs = createFormRefs();

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-1",
              customCharacterName: false,
              characterName: "",
              persistCharacter: false,
              clearPage: false,
            },
          },
        },
      },
    );

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-1",
              customCharacterName: true,
              characterName: "Boss",
              persistCharacter: false,
              clearPage: false,
            },
          },
        },
      },
    );

    handleFormChange(
      {
        props: {
          layouts,
          characters,
        },
        refs,
        render,
        store: createStore(state),
      },
      {
        _event: {
          detail: {
            values: {
              mode: "adv",
              resourceId: "layout-adv",
              characterId: "character-2",
              customCharacterName: true,
              characterName: "Boss",
              persistCharacter: false,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.selectedCharacterId).toBe("character-2");
    expect(state.customCharacterName).toBe(true);
    expect(state.characterName).toBe("Boss");
  });

  it("submits persistCharacter when enabled", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSelectedCharacterId({ state }, { characterId: "character-1" });
    setPersistCharacter({ state }, { persistCharacter: true });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {},
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        characterId: "character-1",
        persistCharacter: true,
      },
    });
  });

  it("submits dialogue.character.name when custom naming is enabled", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSelectedCharacterId({ state }, { characterId: "character-1" });
    setCustomCharacterName({ state }, { customCharacterName: true });
    setCharacterName({ state }, { characterName: "Boss" });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {},
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        characterId: "character-1",
        character: {
          name: "Boss",
        },
        persistCharacter: false,
      },
    });
  });

  it("submits persistCharacter for custom naming without a selected character", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setCustomCharacterName({ state }, { customCharacterName: true });
    setCharacterName({ state }, { characterName: "Boss" });
    setPersistCharacter({ state }, { persistCharacter: true });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {},
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        character: {
          name: "Boss",
        },
        persistCharacter: true,
      },
    });
  });

  it("submits persistCharacter when custom naming has no character name", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setCustomCharacterName({ state }, { customCharacterName: true });
    setCharacterName({ state }, { characterName: "" });
    setPersistCharacter({ state }, { persistCharacter: true });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {},
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        character: {
          name: "",
        },
        persistCharacter: true,
      },
    });
  });

  it("submits persistCharacter false when clearing an existing persisted flag", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setPersistCharacter({ state }, { persistCharacter: false });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {
          persistCharacter: true,
        },
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        persistCharacter: false,
      },
    });
  });

  it("submits persistCharacter false by default", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {},
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        persistCharacter: false,
      },
    });
  });

  it("submits persistCharacter false when no character is selected", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setPersistCharacter({ state }, { persistCharacter: true });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {},
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        persistCharacter: false,
      },
    });
  });

  it("omits dialogue.character when custom naming is disabled", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSelectedCharacterId({ state }, { characterId: "character-1" });
    setCustomCharacterName({ state }, { customCharacterName: false });
    setCharacterName({ state }, { characterName: "Boss" });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {
          character: {
            name: "Boss",
          },
        },
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        characterId: "character-1",
        persistCharacter: false,
      },
    });
  });
});
