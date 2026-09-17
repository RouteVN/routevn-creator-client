import { describe, expect, it, vi } from "vitest";
import * as actions from "../../src/components/audioPlayer/audioPlayer.store.js";
import {
  handleSeekStart,
  handleSeekInput,
  handleSeekEnd,
  handleSeekChange,
  handleSeekCancel,
} from "../../src/components/audioPlayer/audioPlayer.handlers.js";

const setup = () => {
  const state = actions.createInitialState();
  state.duration = 120;
  state.currentTime = 30;
  const store = {};
  for (const [name, action] of Object.entries(actions)) {
    store[name] = (payload) => action({ state }, payload);
  }
  const deps = {
    store,
    render: vi.fn(),
    audioService: {
      seek: vi.fn(async (time) => store.setCurrentTime({ currentTime: time })),
    },
  };
  return { state, deps };
};
const eventAt = (valueAsNumber) => ({
  _event: { currentTarget: { valueAsNumber } },
});

describe("audio seeking", () => {
  it("previews dragging without repeated audio seeks or playback ticks moving the handle", async () => {
    const { state, deps } = setup();
    handleSeekStart(deps, eventAt(30));
    handleSeekInput(deps, eventAt(60));
    handleSeekInput(deps, eventAt(90));
    deps.store.setCurrentTime({ currentTime: 31 });

    expect(actions.selectProgressPercentage({ state })).toBe(75);
    expect(actions.selectFormattedCurrentTime({ state })).toBe("1:30");
    expect(deps.audioService.seek).not.toHaveBeenCalled();

    await handleSeekChange(deps, eventAt(90));
    expect(deps.audioService.seek).toHaveBeenCalledExactlyOnceWith(90);
    expect(state.seekTime).toBeUndefined();
    expect(state.currentTime).toBe(90);
  });

  it("cancels a drag without seeking", () => {
    const { state, deps } = setup();
    handleSeekInput(deps, eventAt(100));
    handleSeekCancel(deps);
    expect(state.seekTime).toBeUndefined();
    expect(actions.selectFormattedCurrentTime({ state })).toBe("0:30");
    expect(deps.audioService.seek).not.toHaveBeenCalled();
  });

  it("resumes playback updates after pressing and releasing without a change", () => {
    const { state, deps } = setup();
    handleSeekStart(deps, eventAt(30));
    deps.store.setCurrentTime({ currentTime: 31 });
    expect(actions.selectFormattedCurrentTime({ state })).toBe("0:30");

    handleSeekEnd(deps);
    deps.store.setCurrentTime({ currentTime: 32 });
    expect(state.seekTime).toBeUndefined();
    expect(actions.selectFormattedCurrentTime({ state })).toBe("0:32");
    expect(deps.audioService.seek).not.toHaveBeenCalled();
  });

  it("preserves the released native value when change follows pointerup", async () => {
    const { state, deps } = setup();
    const payload = eventAt(90);
    handleSeekInput(deps, payload);
    deps.render.mockImplementation(() => {
      payload._event.currentTarget.valueAsNumber =
        state.seekTime ?? state.currentTime;
    });

    handleSeekEnd(deps);
    await handleSeekChange(deps, payload);
    expect(deps.audioService.seek).toHaveBeenCalledExactlyOnceWith(90);
    expect(state.seekTime).toBeUndefined();
  });

  it("does not freeze playback updates while native seeking is pending", async () => {
    const { state, deps } = setup();
    const pending = Promise.withResolvers();
    deps.audioService.seek.mockReturnValue(pending.promise);
    handleSeekInput(deps, eventAt(90));
    const finishing = handleSeekChange(deps, eventAt(90));
    deps.store.setCurrentTime({ currentTime: 32 });
    expect(state.seekTime).toBeUndefined();
    expect(actions.selectFormattedCurrentTime({ state })).toBe("0:32");
    pending.resolve();
    await finishing;
  });

  it("does not clear a new drag when the previous seek completes", async () => {
    const { state, deps } = setup();
    const pending = Promise.withResolvers();
    deps.audioService.seek.mockReturnValue(pending.promise);
    handleSeekInput(deps, eventAt(90));
    const finishing = handleSeekChange(deps, eventAt(90));
    handleSeekInput(deps, eventAt(90));
    pending.resolve();
    await finishing;
    expect(state.seekTime).toBe(90);
  });
});
