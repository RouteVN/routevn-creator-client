import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { installPlayerAudioUnlock } from "../../scripts/playerAudioUnlock.js";

describe("player audio unlock", () => {
  it("resumes exported-player audio directly from native user interactions", async () => {
    const dom = new JSDOM("<button>Play</button>");
    const resumeAudio = vi.fn(async () => {});
    const cleanup = installPlayerAudioUnlock({
      eventTarget: dom.window.document,
      resumeAudio,
    });

    dom.window.document
      .querySelector("button")
      .dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    await Promise.resolve();

    expect(resumeAudio).toHaveBeenCalledTimes(1);

    cleanup();
    dom.window.document.querySelector("button").dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        key: "Enter",
      }),
    );
    await Promise.resolve();

    expect(resumeAudio).toHaveBeenCalledTimes(1);
    dom.window.close();
  });

  it("keeps later interactions able to retry a blocked audio context", async () => {
    const dom = new JSDOM("<button>Play</button>");
    const resumeAudio = vi
      .fn()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValue(undefined);
    installPlayerAudioUnlock({
      eventTarget: dom.window.document,
      resumeAudio,
    });

    const button = dom.window.document.querySelector("button");
    button.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    button.dispatchEvent(new dom.window.Event("touchend", { bubbles: true }));
    await Promise.resolve();

    expect(resumeAudio).toHaveBeenCalledTimes(2);
    dom.window.close();
  });
});
