import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleBeforeMount,
  handleButtonSelectClick,
  handleCharacterItemClick,
  handleFormChange,
  handleSpriteGroupTabClick,
  handleSpriteItemClick,
  handleSubmitClick,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.handlers.js";
import {
  clearCharacterSprite,
  clearTempSelectedSpriteIds,
  createInitialState,
  setAppendDialogue,
  setCharacterSpriteEnabled,
  setCharacterName,
  setClearPage,
  setCustomCharacterName,
  setMode,
  setPersistCharacter,
  setSelectedCharacterId,
  setSelectedSpriteGroupId,
  setSelectedSpriteIds,
  setSelectedMode,
  setSelectedResource,
  setSearchQuery,
  setSpriteCharacterId,
  setSpriteAnimationId,
  setSpriteAnimationMode,
  setSpriteTransformId,
  setTempSelectedSpriteId,
  setTempSelectedSpriteIds,
  showFullImagePreview,
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
    spriteGroups: [
      { id: "body", name: "Body" },
      { id: "face", name: "Face" },
    ],
    sprites: {
      tree: [{ id: "sprite-body" }, { id: "sprite-face" }],
      items: {
        "sprite-body": {
          id: "sprite-body",
          type: "image",
          name: "Body",
        },
        "sprite-face": {
          id: "sprite-face",
          type: "image",
          name: "Smile",
        },
      },
    },
  },
  {
    id: "character-2",
    type: "character",
    name: "Mina",
  },
];

const transforms = {
  tree: [{ id: "portrait-left" }],
  items: {
    "portrait-left": {
      id: "portrait-left",
      type: "transform",
      name: "Portrait Left",
    },
  },
};

const animations = {
  tree: [{ id: "portrait-in" }],
  items: {
    "portrait-in": {
      id: "portrait-in",
      type: "animation",
      name: "Portrait In",
      animation: {
        type: "transition",
      },
    },
  },
};

const createStore = (state) => ({
  getState: () => state,
  setSelectedMode: (payload) => setSelectedMode({ state }, payload),
  setSelectedResource: (payload) => setSelectedResource({ state }, payload),
  setSelectedCharacterId: (payload) =>
    setSelectedCharacterId({ state }, payload),
  setCustomCharacterName: (payload) =>
    setCustomCharacterName({ state }, payload),
  setCharacterName: (payload) => setCharacterName({ state }, payload),
  setCharacterSpriteEnabled: (payload) =>
    setCharacterSpriteEnabled({ state }, payload),
  setSpriteCharacterId: (payload) => setSpriteCharacterId({ state }, payload),
  setSpriteTransformId: (payload) => setSpriteTransformId({ state }, payload),
  setSelectedSpriteIds: (payload) => setSelectedSpriteIds({ state }, payload),
  setTempSelectedSpriteIds: (payload) =>
    setTempSelectedSpriteIds({ state }, payload),
  clearTempSelectedSpriteIds: (payload) =>
    clearTempSelectedSpriteIds({ state }, payload),
  setTempSelectedSpriteId: (payload) =>
    setTempSelectedSpriteId({ state }, payload),
  setSelectedSpriteGroupId: (payload) =>
    setSelectedSpriteGroupId({ state }, payload),
  clearCharacterSprite: (payload) => clearCharacterSprite({ state }, payload),
  setSearchQuery: (payload) => setSearchQuery({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  showFullImagePreview: (payload) => showFullImagePreview({ state }, payload),
  setSpriteAnimationMode: (payload) =>
    setSpriteAnimationMode({ state }, payload),
  setSpriteAnimationId: (payload) => setSpriteAnimationId({ state }, payload),
  setAppendDialogue: (payload) => setAppendDialogue({ state }, payload),
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
          append: true,
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
    expect(state.appendDialogue).toBe(true);
    expect(state.customCharacterName).toBe(true);
    expect(state.characterName).toBe("Boss");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        customCharacterName: true,
        characterName: "Boss",
        append: true,
        persistCharacter: true,
      }),
    });
  });

  it("hydrates dialogue character sprite from props into the form state", () => {
    const state = createInitialState();
    const reset = vi.fn();
    const setValues = vi.fn();

    const deps = {
      props: {
        layouts,
        characters,
        transforms,
        animations,
        dialogue: {
          mode: "adv",
          ui: {
            resourceId: "layout-adv",
          },
          characterId: "character-1",
          character: {
            sprite: {
              transformId: "portrait-left",
              items: [
                { id: "body", resourceId: "sprite-body" },
                { id: "face", resourceId: "sprite-face" },
              ],
              animations: {
                resourceId: "portrait-in",
              },
            },
          },
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

    expect(state.characterSpriteEnabled).toBe(true);
    expect(state.spriteCharacterId).toBe("character-1");
    expect(state.spriteTransformId).toBe("portrait-left");
    expect(state.spriteAnimationMode).toBe("transition");
    expect(state.spriteAnimationId).toBe("portrait-in");
    expect(state.selectedSpriteIds).toEqual({
      body: "sprite-body",
      face: "sprite-face",
    });
    expect(setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        characterId: "character-1",
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
              append: true,
              persistCharacter: true,
              clearPage: false,
            },
          },
        },
      },
    );

    expect(state.persistCharacter).toBe(true);
    expect(state.appendDialogue).toBe(true);
    expect(state.characterName).toBe("Aki");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("emits temporary presentation state changes from form edits", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const refs = createFormRefs();

    handleFormChange(
      {
        props: {
          layouts,
          characters,
          dialogue: {
            content: [{ text: "Line text" }],
          },
        },
        refs,
        render,
        store: createStore(state),
        dispatchEvent,
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

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        dialogue: {
          mode: "adv",
          ui: {
            resourceId: "layout-adv",
          },
          characterId: "character-1",
          persistCharacter: false,
          content: [{ text: "Line text" }],
        },
      },
    });
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

  it("submits append when enabled for ADV dialogue", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setAppendDialogue({ state }, { append: true });

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
        append: true,
        persistCharacter: false,
      },
    });
  });

  it("submits append false when clearing existing ADV append", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setAppendDialogue({ state }, { append: false });

    handleSubmitClick({
      props: {
        layouts,
        dialogue: {
          append: true,
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
        append: false,
        persistCharacter: false,
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

  it("submits dialogue.character.sprite when a character sprite is selected", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSelectedCharacterId({ state }, { characterId: "character-1" });
    setSpriteCharacterId({ state }, { characterId: "character-1" });
    setCharacterSpriteEnabled(
      { state },
      {
        characterSpriteEnabled: true,
      },
    );
    setSpriteTransformId(
      { state },
      {
        transformId: "portrait-left",
      },
    );
    setSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body",
          face: "sprite-face",
        },
      },
    );
    setSpriteAnimationMode(
      { state },
      {
        mode: "transition",
      },
    );
    setSpriteAnimationId(
      { state },
      {
        animationId: "portrait-in",
      },
    );

    handleSubmitClick({
      props: {
        layouts,
        characters,
        transforms,
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
          sprite: {
            transformId: "portrait-left",
            items: [
              { id: "body", resourceId: "sprite-body" },
              { id: "face", resourceId: "sprite-face" },
            ],
            animations: {
              resourceId: "portrait-in",
            },
          },
        },
        persistCharacter: false,
      },
    });
  });

  it("tracks character sprite selections from the picker before submit", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const deps = {
      props: {
        layouts,
        characters,
        transforms,
        animations,
      },
      render,
      store: createStore(state),
    };

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSelectedCharacterId({ state }, { characterId: "character-1" });

    handleCharacterItemClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            characterId: "character-1",
          },
        },
      },
    });

    expect(state.mode).toBe("sprite-select");
    expect(state.spriteCharacterId).toBe("character-1");
    expect(state.spriteTransformId).toBe("portrait-left");

    handleSpriteItemClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            spriteId: "sprite-body",
          },
        },
      },
    });
    handleSpriteGroupTabClick(deps, {
      _event: {
        detail: {
          id: "face",
        },
      },
    });
    handleSpriteItemClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            spriteId: "sprite-face",
          },
        },
      },
    });
    setSpriteAnimationMode({ state }, { mode: "transition" });
    setSpriteAnimationId({ state }, { animationId: "portrait-in" });
    handleButtonSelectClick(deps);

    expect(state.selectedSpriteIds).toEqual({
      body: "sprite-body",
      face: "sprite-face",
    });
    expect(state.characterSpriteEnabled).toBe(true);
    expect(state.mode).toBe("current");

    handleSubmitClick({
      props: {
        layouts,
        characters,
        transforms,
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(
      dispatchEvent.mock.calls[0][0].detail.dialogue.character.sprite,
    ).toEqual({
      transformId: "portrait-left",
      items: [
        { id: "body", resourceId: "sprite-body" },
        { id: "face", resourceId: "sprite-face" },
      ],
      animations: {
        resourceId: "portrait-in",
      },
    });
  });

  it("emits temporary sprite selections before the picker is submitted", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const deps = {
      props: {
        layouts,
        characters,
        transforms,
        dialogue: {
          content: [{ text: "Sprite line" }],
        },
      },
      render,
      dispatchEvent,
      store: createStore(state),
    };

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSelectedCharacterId({ state }, { characterId: "character-1" });

    handleCharacterItemClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            characterId: "character-1",
          },
        },
      },
    });
    handleSpriteItemClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            spriteId: "sprite-body",
          },
        },
      },
    });

    const event =
      dispatchEvent.mock.calls[dispatchEvent.mock.calls.length - 1][0];
    expect(event.type).toBe("temporary-presentation-state-change");
    expect(event.detail.presentationState.dialogue.character.sprite).toEqual({
      transformId: "portrait-left",
      items: [{ id: "body", resourceId: "sprite-body" }],
    });
    expect(event.detail.presentationState.dialogue.content).toEqual([
      { text: "Sprite line" },
    ]);
  });

  it("submits a character sprite without a selected speaker", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setSelectedMode({ state }, { mode: "adv" });
    setSelectedResource({ state }, { resourceId: "layout-adv" });
    setSpriteCharacterId({ state }, { characterId: "character-1" });
    setSpriteTransformId({ state }, { transformId: "portrait-left" });
    setSelectedSpriteIds(
      { state },
      {
        spriteIdsByGroupId: {
          body: "sprite-body",
        },
      },
    );

    handleSubmitClick({
      props: {
        layouts,
        characters,
        transforms,
      },
      store: createStore(state),
      dispatchEvent,
    });

    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "layout-adv",
        },
        character: {
          sprite: {
            transformId: "portrait-left",
            items: [{ id: "body", resourceId: "sprite-body" }],
          },
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
