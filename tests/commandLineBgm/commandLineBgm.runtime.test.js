import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  createInitialState,
  insertSound,
  removeSound,
  selectBgm,
  setBgm,
  updateChannel,
  updateSound,
} from "../../src/components/commandLineBgm/commandLineBgm.store.js";

const renderCommands = (commands, { audioEffects = {} } = {}) => {
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
          sounds: {
            theme: { fileId: "theme.ogg" },
            other: { fileId: "other.ogg" },
          },
          audioEffects,
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

// The audio effects new projects start with, by name.
const readTemplateAudioEffects = () => {
  const repository = JSON.parse(
    readFileSync(
      new URL(
        "../../static/templates/default/repository.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return Object.fromEntries(
    Object.values(repository.audioEffects.items)
      .filter((item) => item.type === "audioEffect")
      .map((item) => [item.name, item.audioEffect]),
  );
};

describe("BGM editor audio effects", () => {
  // The template effects fade to volume 100. Effects play relative to the
  // volume the line sets, so they end at the channel volume of 75 the editor
  // gives new BGM, not at full volume.
  const templateEffects = readTemplateAudioEffects();
  const audioEffects = {
    fadeIn: templateEffects["Fade in 1s"],
    crossfade: templateEffects["Crossfade 1s"],
  };

  it("fades music in to the channel volume", () => {
    const state = createInitialState();
    insertSound({ state }, { resourceId: "theme" });
    updateChannel({ state }, { values: { audioEffectId: "fadeIn" } });
    updateSound(
      { state },
      { soundId: "theme", values: { beginEffectId: "fadeIn" } },
    );
    const bgm = selectBgm({ state });
    expect(bgm.volume).toBe(75);

    const [rendered] = renderCommands([bgm], { audioEffects });
    const sound = rendered.audio[0].children[0];
    const [effect] = rendered.audioEffects;

    expect(sound.volume).toBe(75);
    expect(effect.targetId).toBe(sound.id);
    expect(effect.properties.volume.enter.keyframes.at(-1).value).toBe(75);
    expect(sound.beginEffect.volume.keyframes.at(-1).value).toBe(75);
  });

  it("crossfades between two tracks at the channel volume", () => {
    const playing = createInitialState();
    insertSound({ state: playing }, { resourceId: "theme" });
    const next = createInitialState();
    insertSound({ state: next }, { resourceId: "other" });
    updateChannel({ state: next }, { values: { audioEffectId: "crossfade" } });

    const [before, after] = renderCommands(
      [selectBgm({ state: playing }), selectBgm({ state: next })],
      { audioEffects },
    );
    const effectOn = (targetId) =>
      after.audioEffects.find((effect) => effect.targetId === targetId)
        .properties.volume;

    // The outgoing track fades out from the volume it plays at.
    expect(before.audio[0].children[0].volume).toBe(75);
    expect(effectOn("bgm:theme").exit.keyframes.at(-1).value).toBe(0);

    const incoming = effectOn("bgm:other").enter;
    expect(
      after.audio[0].children.find(({ id }) => id === "bgm:other").volume,
    ).toBe(75);
    expect(incoming.initialValue).toBe(0);
    expect(incoming.keyframes.at(-1).value).toBe(75);
  });
});
