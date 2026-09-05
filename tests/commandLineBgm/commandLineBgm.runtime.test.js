import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  createInitialState,
  insertSound,
  removeSound,
  selectBgm,
  setBgm,
  updateChannel,
} from "../../src/components/commandLineBgm/commandLineBgm.store.js";

const renderCommands = (commands) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    },
  });
  engine.init({
    initialState: {
      projectData: {
        screen: { width: 640, height: 360 },
        resources: {
          sounds: { theme: { fileId: "theme.ogg" } },
        },
        story: {
          initialSceneId: "scene",
          scenes: {
            scene: {
              initialSectionId: "section",
              sections: {
                section: {
                  lines: commands.map((bgm, index) => ({
                    id: `line-${index}`,
                    actions: { bgm },
                  })),
                },
              },
            },
          },
        },
      },
    },
  });
  return commands.map((_, index) => {
    if (index > 0) {
      engine.handleAction("markLineCompleted", {});
      engine.handleAction("nextLine", {});
    }
    const rendered = engine.selectRenderState();
    engine.commitRenderState(rendered);
    return rendered;
  });
};

describe("BGM editor playback identity", () => {
  it.each(["default", "theme"])(
    "retains the surviving %s occurrence after removal, reopening, and a volume edit",
    (survivorId) => {
      const original = {
        loop: true,
        volume: 80,
        sounds: [
          { id: "default", resourceId: "theme", volume: 40, loop: false },
          { id: "theme", resourceId: "theme", volume: 70, loop: false },
        ],
      };
      const state = createInitialState();
      setBgm({ state }, { bgm: original });
      removeSound(
        { state },
        { soundId: survivorId === "default" ? "theme" : "default" },
      );
      const saved = structuredClone(selectBgm({ state }));
      setBgm({ state }, { bgm: saved });
      updateChannel({ state }, { values: { volume: 35 } });

      // Play the edited command directly after the original two-clip command.
      const [before, after] = renderCommands([original, selectBgm({ state })]);
      const originalIndex = original.sounds.findIndex(
        ({ id }) => id === survivorId,
      );
      const retained = after.audio[0].children[0];
      expect(after.audio[0].children).toHaveLength(1);
      expect(retained.id).toBe(before.audio[0].children[originalIndex].id);
      expect(retained.volume).toBeCloseTo(
        (35 * original.sounds[originalIndex].volume) / 100,
      );
      expect(selectBgm({ state }).sounds[0].id).toBe(survivorId);
      expect(saved.sounds[0].id).toBe(survivorId);
    },
  );

  it("retains a default clip when another copy is inserted", () => {
    const original = { sounds: [{ id: "default", resourceId: "theme" }] };
    const state = createInitialState();
    setBgm({ state }, { bgm: original });
    insertSound({ state }, { resourceId: "theme" });

    const [before, after] = renderCommands([original, selectBgm({ state })]);
    const [retained, inserted] = after.audio[0].children;
    expect(retained.id).toBe(before.audio[0].children[0].id);
    expect(inserted.id).not.toBe(retained.id);
    expect(selectBgm({ state }).sounds.map(({ id }) => id)).toEqual([
      "default",
      "theme",
    ]);
  });

  it("preserves legacy handoffs through an edited default clip", () => {
    const legacy = { resourceId: "theme", volume: 80, loop: true };
    const state = createInitialState();
    setBgm(
      { state },
      { bgm: { sounds: [{ id: "default", resourceId: "theme" }] } },
    );
    updateChannel({ state }, { values: { volume: 35 } });

    const rendered = renderCommands([legacy, selectBgm({ state }), legacy]);
    expect(rendered.map(({ audio }) => audio[0].children[0].id)).toEqual([
      "bgm:theme",
      "bgm:theme",
      "bgm:theme",
    ]);
  });
});
