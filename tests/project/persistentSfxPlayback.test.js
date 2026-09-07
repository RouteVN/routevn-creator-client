import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import { normalizeLineActions } from "../../src/internal/project/engineActions.js";
import { constructProjectData } from "../../src/internal/project/projection.js";
import {
  createInitialState as createSystemActionsState,
  selectActionsData,
} from "../../src/components/systemActions/systemActions.store.js";
import {
  createInitialState as createSfxState,
  selectSfx,
  setSfx,
  updateChannel,
} from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js";

const createSfxAction = (soundId, channel = {}, sound = {}) => ({
  sfx: {
    channels: [
      {
        id: "Environment",
        applyMode: "persistent",
        ...channel,
        sounds: [{ id: soundId, resourceId: "rain", ...sound }],
      },
    ],
  },
});

const createRepositoryState = (firstActions, secondActions) => {
  const sections = Object.fromEntries(
    [firstActions, secondActions].map((actions, index) => {
      const id = `section-${index + 1}`;
      return [
        id,
        {
          id,
          lines: {
            items: { [id]: { id, actions } },
            tree: [{ id }],
          },
        },
      ];
    }),
  );
  return {
    project: { resolution: { width: 1920, height: 1080 } },
    story: { initialSceneId: "scene-1" },
    sounds: {
      items: { rain: { id: "rain", type: "sound", fileId: "rain.wav" } },
      tree: [{ id: "rain" }],
    },
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          sections: {
            items: sections,
            tree: Object.keys(sections).map((id) => ({ id })),
          },
        },
      },
      tree: [{ id: "scene-1" }],
    },
  };
};

const renderAcrossSections = (repositoryState) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      }
    },
  });
  engine.init({
    initialState: { projectData: constructProjectData(repositoryState) },
  });
  const before = engine.selectRenderState();
  engine.commitRenderState(before);
  engine.handleAction("sectionTransition", { sectionId: "section-2" });
  return { before: before.audio, after: engine.selectRenderState().audio };
};

describe("persistent SFX playback identity", () => {
  it.each([false, true])(
    "continues independently created matching sounds across sections (channel loop: %s)",
    (loop) => {
      const repositoryState = createRepositoryState(
        createSfxAction("manually-added-one", { loop }),
        createSfxAction("manually-added-two", { loop }),
      );
      const originalState = structuredClone(repositoryState);
      const { before, after } = renderAcrossSections(repositoryState);

      expect(before).toHaveLength(1);
      expect(before[0].children).toHaveLength(1);
      expect(after).toEqual(before);
      expect(repositoryState).toEqual(originalState);
    },
  );

  it("keeps Single Line sound instances distinct so they can replay", () => {
    const { before, after } = renderAcrossSections(
      createRepositoryState(
        createSfxAction("one-shot-one", { applyMode: "singleLine" }),
        createSfxAction("one-shot-two", { applyMode: "singleLine" }),
      ),
    );

    expect(after[0].id).toBe(before[0].id);
    expect(after[0].children[0].src).toBe(before[0].children[0].src);
    expect(after[0].children[0].id).not.toBe(before[0].children[0].id);
  });

  it("replays independently authored actions after reopening and switching both to Single Line", () => {
    const editedActions = ["authored-one", "authored-two"].map((id) => {
      const authoredActions = createSfxAction(id);
      const { actions } = selectActionsData({
        state: createSystemActionsState(),
        props: {
          actions: authoredActions,
          presentationState: normalizeLineActions(authoredActions),
        },
      });
      const state = createSfxState();
      setSfx({ state }, { sfx: actions.sfx });
      updateChannel(
        { state },
        { channelId: "Environment", values: { applyMode: "singleLine" } },
      );
      const saved = normalizeLineActions({ sfx: selectSfx({ state }) });
      const soundId = saved.sfx.channels[0].sounds[0].id;

      // Reopening or updating an already Single Line channel must keep the
      // newly authored instance stable within that action.
      setSfx({ state }, { sfx: saved.sfx });
      updateChannel(
        { state },
        { channelId: "Environment", values: { applyMode: "singleLine" } },
      );
      expect(selectSfx({ state }).channels[0].sounds[0].id).toBe(soundId);
      return saved;
    });
    const { before, after } = renderAcrossSections(
      createRepositoryState(...editedActions),
    );

    expect(after[0].children[0].src).toBe(before[0].children[0].src);
    expect(after[0].children[0].id).not.toBe(before[0].children[0].id);
  });

  it.each([
    ["startDelayMs", 4000],
    ["startAt", 4],
    ["endAt", 8],
  ])(
    "keeps a surviving repeated clip stable when the removed clip differs in %s",
    (field, value) => {
      const first = createSfxAction("first", {}, { [field]: 0 });
      const survivingSound = {
        id: "second",
        resourceId: "rain",
        [field]: value,
      };
      first.sfx.channels[0].sounds.push(survivingSound);
      const second = createSfxAction("second", {}, survivingSound);
      const { before, after } = renderAcrossSections(
        createRepositoryState(first, second),
      );

      expect(before[0].children).toHaveLength(2);
      expect(after[0].children).toEqual([before[0].children[1]]);
    },
  );

  it("updates volume on the continuing sound", () => {
    const { before, after } = renderAcrossSections(
      createRepositoryState(
        createSfxAction("one", {}, { volume: 80, startAt: 0 }),
        createSfxAction("two", {}, { volume: 40, startAt: 0 }),
      ),
    );

    expect(after[0].children[0].id).toBe(before[0].children[0].id);
    expect(after[0].children[0]).toMatchObject({ volume: 40, startAt: 0 });
    expect(before[0].children[0]).toMatchObject({ volume: 80, startAt: 0 });
  });

  it("keeps repeated sounds distinct and normalizes nested actions idempotently", () => {
    const first = createSfxAction("first");
    first.sfx.channels[0].sounds.push({
      id: "second",
      resourceId: "rain",
      startDelayMs: 4000,
    });
    first.sfx.channels[0].sounds.push({
      id: "third",
      resourceId: "rain",
      startDelayMs: 4000,
    });
    const second = structuredClone(first);
    second.sfx.channels[0].sounds[0].id = "another-first";
    second.sfx.channels[0].sounds[1].id = "another-second";
    second.sfx.channels[0].sounds[2].id = "another-third";
    const original = structuredClone(first);
    const normalized = normalizeLineActions({
      conditional: { branches: [{ actions: first }, { actions: second }] },
    });
    const [firstBranch, secondBranch] = normalized.conditional.branches;
    const sounds = firstBranch.actions.sfx.channels[0].sounds;

    expect(firstBranch.actions).toEqual(secondBranch.actions);
    expect(sounds[0].id).not.toBe(sounds[1].id);
    expect(sounds[1].id).not.toBe(sounds[2].id);
    expect(sounds[1].startDelayMs).toBe(4000);
    expect(normalizeLineActions(normalized)).toEqual(normalized);
    expect(first).toEqual(original);
  });

  it("preserves stop actions and default Single Line IDs", () => {
    for (const actions of [
      { sfx: { channels: [] } },
      {
        sfx: {
          channels: [
            { id: "Environment", applyMode: "persistent", sounds: [] },
          ],
        },
      },
      {
        sfx: {
          channels: [
            { id: "Effects", sounds: [{ id: "one-shot", resourceId: "rain" }] },
          ],
        },
      },
    ]) {
      expect(normalizeLineActions(actions)).toEqual(actions);
    }
  });
});
