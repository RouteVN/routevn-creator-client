import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSceneEditorSectionWithName,
  scrollSceneEditorSectionTabIntoView,
} from "../../src/internal/ui/sceneEditor/sectionOperations.js";

describe("scene editor section operations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([0, 1996, 3400])(
    "jumps to the section beginning from scroll position %i, ignoring its sticky header",
    (scrollTop) => {
      vi.stubGlobal("requestAnimationFrame", (callback) => callback());
      const section = {
        dataset: { sectionBlockId: "section-2" },
        getBoundingClientRect: () => ({ top: 200 + 1296 - scrollTop }),
      };
      const stickyHeader = {
        dataset: { sectionId: "section-2" },
        getBoundingClientRect: () => ({ top: 200 }),
        scrollIntoView: vi.fn(),
      };
      const scrollContainer = {
        scrollTop,
        clientTop: 0,
        getBoundingClientRect: () => ({ top: 200 }),
        querySelectorAll: vi.fn(() => [section]),
        scrollTo: vi.fn(),
      };

      scrollSceneEditorSectionTabIntoView(
        {
          refs: {
            sceneEditorSectionsScroll: scrollContainer,
            sectionHeader1: stickyHeader,
          },
        },
        "section-2",
      );

      expect(scrollContainer.scrollTo).toHaveBeenCalledExactlyOnceWith({
        top: 1296,
        behavior: "instant",
      });
      expect(stickyHeader.scrollIntoView).not.toHaveBeenCalled();
    },
  );

  it("does not jump to another matching ref when the section has been removed", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const overviewRow = {
      dataset: { sectionId: "section-2" },
      scrollIntoView: vi.fn(),
    };
    const scrollContainer = {
      querySelectorAll: () => [],
      scrollTo: vi.fn(),
    };

    scrollSceneEditorSectionTabIntoView(
      {
        refs: {
          sceneEditorSectionsScroll: scrollContainer,
          sectionOverviewRow1: overviewRow,
        },
      },
      "section-2",
    );

    expect(scrollContainer.scrollTo).not.toHaveBeenCalled();
    expect(overviewRow.scrollIntoView).not.toHaveBeenCalled();
  });

  const dialogueLayout = { id: "dialogue-layout", layoutType: "dialogue-adv" };
  const control = { resourceId: "control-1", resourceType: "control" };
  const choice = {
    resourceId: "choice-layout",
    items: [
      {
        content: "Go on",
        events: {
          click: {
            actions: {
              sectionTransition: {
                sceneId: "scene-1",
                sectionId: "section-2",
              },
            },
          },
        },
      },
    ],
  };
  const defaultFirstLineActions = {
    dialogue: {
      ui: { resourceId: "dialogue-layout" },
      mode: "adv",
      content: [{ text: "" }],
    },
    control,
  };

  // The editor's presentation state comes from frozen engine state.
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };

  const createFirstLineActions = async ({
    presentationState,
    inheritPresentationFromSelectedLine,
  }) => {
    vi.useFakeTimers();
    const frozenPresentationState = deepFreeze(
      structuredClone(presentationState),
    );

    try {
      const projectService = {
        getState: vi.fn(() => ({
          layouts: { items: { "dialogue-layout": dialogueLayout } },
          controls: {
            items: { "control-1": { id: "control-1", type: "control" } },
          },
        })),
        createSectionItem: vi.fn(async () => {}),
        createLineItem: vi.fn(async () => {}),
      };

      await createSceneEditorSectionWithName(
        {
          store: {
            selectSceneId: vi.fn(() => "scene-1"),
            selectEffectivePresentationState: vi.fn(
              () => frozenPresentationState,
            ),
          },
          projectService,
          render: vi.fn(),
          subject: { dispatch: vi.fn() },
        },
        "Section Two",
        vi.fn(),
        { inheritPresentationFromSelectedLine },
      );

      return projectService.createLineItem.mock.calls[0][0].data.actions;
    } finally {
      vi.useRealTimers();
    }
  };

  it("does not copy the selected line's choice or form into a new section", async () => {
    const actions = await createFirstLineActions({
      presentationState: {
        dialogue: {
          ui: { resourceId: "dialogue-layout" },
          mode: "adv",
          content: [{ text: "Pick one" }],
        },
        control,
        choice,
        form: { resourceId: "form-layout" },
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual(defaultFirstLineActions);
  });

  it("inherits the selected line's state when it has no choice", async () => {
    const background = { resourceId: "background-1" };
    const actions = await createFirstLineActions({
      presentationState: {
        background,
        dialogue: {
          ui: { resourceId: "dialogue-layout" },
          mode: "adv",
          content: [{ text: "Hello" }],
        },
        control,
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual({ ...defaultFirstLineActions, background });
  });

  it("falls back to the default first line when only a choice was inheritable", async () => {
    const actions = await createFirstLineActions({
      presentationState: { choice },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual(defaultFirstLineActions);
  });

  it("uses the default first line when not inheriting from a choice line", async () => {
    const actions = await createFirstLineActions({
      presentationState: { control, choice },
      inheritPresentationFromSelectedLine: false,
    });

    expect(actions).toEqual(defaultFirstLineActions);
  });

  it("does not copy navigation or line-only actions into a new section", async () => {
    const background = { resourceId: "background-1" };
    const actions = await createFirstLineActions({
      presentationState: {
        background,
        dialogue: {
          ui: { resourceId: "dialogue-layout" },
          mode: "adv",
          content: [{ text: "Hello" }],
        },
        control,
        sectionTransition: { sceneId: "scene-1", sectionId: "section-3" },
        resetStoryAtSection: { sectionId: "section-1" },
        nextLine: {},
        conditional: { branches: [] },
        rollbackByOffset: { offset: -1 },
        voice: { resourceId: "voice-1" },
        layout: { resourceId: "layout-1" },
        animation: { resourceId: "animation-1" },
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual({ ...defaultFirstLineActions, background });
  });

  it("keeps only the persistent sound effect channels", async () => {
    const rain = {
      id: "rain",
      applyMode: "persistent",
      sounds: [{ resourceId: "rain-loop", loop: true }],
    };
    const actions = await createFirstLineActions({
      presentationState: {
        ...defaultFirstLineActions,
        sfx: {
          items: [{ resourceId: "door-slam" }],
          channels: [{ id: "1", sounds: [{ resourceId: "knock" }] }, rain],
        },
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual({
      ...defaultFirstLineActions,
      sfx: { channels: [rain] },
    });
  });

  it("leaves out sound effects that only play on the selected line", async () => {
    const actions = await createFirstLineActions({
      presentationState: {
        ...defaultFirstLineActions,
        sfx: {
          items: [{ resourceId: "door-slam" }],
          channels: [{ id: "1", sounds: [{ resourceId: "knock" }] }],
        },
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual(defaultFirstLineActions);
  });

  it("keeps persistent animations and leaves out one-time ones", async () => {
    const persistentAnimations = {
      resourceId: "sway",
      playback: { continuity: "persistent", speed: 1, loop: true },
    };
    const oneTimeAnimations = {
      resourceId: "slide-in",
      playback: { continuity: "render", speed: 1 },
    };
    const actions = await createFirstLineActions({
      presentationState: {
        ...defaultFirstLineActions,
        background: {
          resourceId: "background-1",
          animations: oneTimeAnimations,
        },
        character: {
          items: [
            { id: "hero", resourceId: "hero", animations: oneTimeAnimations },
            {
              id: "friend",
              resourceId: "friend",
              animations: persistentAnimations,
            },
          ],
        },
        visual: {
          items: [
            { id: "cg", resourceId: "cg-1", animations: oneTimeAnimations },
          ],
        },
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual({
      ...defaultFirstLineActions,
      background: { resourceId: "background-1" },
      character: {
        items: [
          { id: "hero", resourceId: "hero" },
          {
            id: "friend",
            resourceId: "friend",
            animations: persistentAnimations,
          },
        ],
      },
      visual: { items: [{ id: "cg", resourceId: "cg-1" }] },
    });
  });

  it("keeps a persistent background animation", async () => {
    const background = {
      resourceId: "background-1",
      animations: {
        resourceId: "drift",
        playback: { continuity: "persistent", speed: 1, loop: true },
      },
    };
    const actions = await createFirstLineActions({
      presentationState: { ...defaultFirstLineActions, background },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual({ ...defaultFirstLineActions, background });
  });

  it("keeps the speaker portrait and leaves out its animation", async () => {
    const sprite = {
      transformId: "portrait",
      items: [{ id: "base", resourceId: "hero-face" }],
    };
    const actions = await createFirstLineActions({
      presentationState: {
        dialogue: {
          ...defaultFirstLineActions.dialogue,
          characterId: "hero",
          character: {
            sprite: {
              ...sprite,
              animations: {
                resourceId: "pop-in",
                playback: { continuity: "persistent", speed: 1 },
              },
            },
          },
          content: [{ text: "Hello" }],
        },
        control,
      },
      inheritPresentationFromSelectedLine: true,
    });

    expect(actions).toEqual({
      dialogue: {
        ...defaultFirstLineActions.dialogue,
        characterId: "hero",
        character: { sprite },
      },
      control,
    });
  });

  it("does not select or scroll to a newly created section", async () => {
    vi.useFakeTimers();

    try {
      const store = {
        selectSceneId: vi.fn(() => "scene-1"),
        setSelectedSectionId: vi.fn(),
        setSelectedLineId: vi.fn(),
      };
      const projectService = {
        getState: vi.fn(() => ({
          layouts: { items: {} },
          controls: { items: {} },
        })),
        createSectionItem: vi.fn(async () => {}),
        createLineItem: vi.fn(async () => {}),
      };
      const render = vi.fn();
      const syncProjectState = vi.fn();

      await createSceneEditorSectionWithName(
        { store, projectService, render, subject: { dispatch: vi.fn() } },
        "New Section",
        syncProjectState,
        {
          inheritPresentationFromSelectedLine: false,
          position: "after",
          positionTargetId: "section-1",
        },
      );

      expect(projectService.createSectionItem).toHaveBeenCalledWith(
        expect.objectContaining({
          sceneId: "scene-1",
          position: "after",
          positionTargetId: "section-1",
          data: {
            name: "New Section",
          },
        }),
      );
      expect(projectService.createLineItem).toHaveBeenCalledOnce();
      expect(syncProjectState).toHaveBeenCalledWith(store, projectService);
      expect(store.setSelectedSectionId).not.toHaveBeenCalled();
      expect(store.setSelectedLineId).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the canvas through the canvas render queue after creating a section", async () => {
    vi.useFakeTimers();

    try {
      const subject = { dispatch: vi.fn() };
      const store = {
        selectSceneId: vi.fn(() => "scene-1"),
      };
      const projectService = {
        getState: vi.fn(() => ({})),
        createSectionItem: vi.fn(async () => {}),
        createLineItem: vi.fn(async () => {}),
      };

      await createSceneEditorSectionWithName(
        { store, projectService, render: vi.fn(), subject },
        "New Section",
        vi.fn(),
        { inheritPresentationFromSelectedLine: false },
      );

      // The queue reports a failed render and alerts once, which a render
      // started from a timer could not do.
      expect(subject.dispatch).toHaveBeenCalledExactlyOnceWith(
        "sceneEditor.renderCanvas",
        {},
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
