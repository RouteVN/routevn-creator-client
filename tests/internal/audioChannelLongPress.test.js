import { describe, expect, it, vi } from "vitest";
import * as bgmStore from "../../src/components/commandLineBgm/commandLineBgm.store.js";
import * as voiceStore from "../../src/components/commandLineVoice/commandLineVoice.store.js";
import * as sfxStore from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js";
import * as bgmHandlers from "../../src/components/commandLineBgm/commandLineBgm.handlers.js";
import * as voiceHandlers from "../../src/components/commandLineVoice/commandLineVoice.handlers.js";
import * as sfxHandlers from "../../src/components/commandLineSoundEffects/commandLineSoundEffects.handlers.js";

const variants = [
  ["BGM", bgmStore, bgmHandlers],
  ["Voice", voiceStore, voiceHandlers],
  ["Sound Effects", sfxStore, sfxHandlers],
];
const resources = {
  items: {
    tone: { id: "tone", name: "Sound One", type: "sound", duration: 2 },
  },
  tree: [{ id: "tone" }],
};

describe.each(variants)("%s clip long press", (name, actions, handlers) => {
  it("opens the right-click actions at the touch point and cancels the pending clip drag", async () => {
    const state = actions.createInitialState();
    const store = {};
    for (const [key, action] of Object.entries(actions)) {
      store[key] = (payload) => action({ state }, payload);
    }
    store.setRepositoryState({ sounds: resources, voices: resources });
    if (name === "Sound Effects") store.addChannel({ id: "Channel One" });
    store.insertSound({
      id: "clip-one",
      resourceId: "tone",
      channelId: "Channel One",
    });
    const sound = (state.bgm?.sounds ??
      state.voice?.sounds ??
      state.channels[0].sounds)[0];
    const originalDelay = sound.startDelayMs;
    store.startSoundDrag({
      soundId: "clip-one",
      channelId: "Channel One",
      pointerId: 1,
      clientX: 0,
      timelineDurationMs: 10000,
      timelineWidthPx: 100,
    });
    store.updateSoundDrag({ pointerId: 1, clientX: 40 });
    expect(sound.startDelayMs).not.toBe(originalDelay);
    const showDropdownMenu = vi.fn(async () => undefined);
    const deps = {
      store,
      render: vi.fn(),
      appService: { showDropdownMenu },
      i18n: { resourcePages: {}, commandLinePage: {}, sceneEditorPage: {} },
    };
    const event = {
      currentTarget: {
        dataset: { soundId: "clip-one", channelId: "Channel One" },
      },
      detail: { clientX: 120, clientY: 240, pointerType: "touch" },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    await handlers.handleSoundLongPress(deps, { _event: event });
    expect(store.selectSoundDrag()).toBeUndefined();
    expect(sound.startDelayMs).toBe(originalDelay);
    const menu = showDropdownMenu.mock.calls[0][0];
    expect(menu.x).toBe(120);
    expect(menu.y).toBe(240);
    expect(menu.items.map((item) => item.key)).toEqual([
      "replace",
      "insert-before",
      "insert-after",
      "remove",
    ]);
    store.updateSoundDrag({ pointerId: 1, clientX: 80 });
    expect(sound.startDelayMs).toBe(originalDelay);

    await handlers.handleSoundContextMenu(deps, {
      _event: { ...event, clientX: 120, clientY: 240 },
    });
    expect(showDropdownMenu.mock.calls[1][0]).toEqual(menu);
  });
});
