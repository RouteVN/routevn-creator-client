import { describe, expect, it } from "vitest";
import { prepareRenderStateAudioChannelsForGraphics } from "../../src/internal/audioRenderState.js";

describe("prepareRenderStateAudioChannelsForGraphics", () => {
  it("applies canonical BGM and Voice loops to channels instead of child sounds", () => {
    const renderState = {
      audio: [
        {
          id: "channel:bgm",
          type: "audio-channel",
          children: [
            { id: "bgm:intro", type: "sound", loop: true },
            { id: "bgm:theme", type: "sound", loop: true },
          ],
        },
        {
          id: "channel:voice",
          type: "audio-channel",
          children: [{ id: "voice:line", type: "sound", loop: true }],
        },
      ],
    };

    const result = prepareRenderStateAudioChannelsForGraphics({
      renderState,
      presentationState: {
        bgm: {
          loop: false,
          sounds: [
            { id: "intro", resourceId: "intro" },
            { id: "theme", resourceId: "theme" },
          ],
        },
        voice: {
          loop: true,
          sounds: [{ id: "line", resourceId: "line" }],
        },
      },
    });

    expect(result.audio).toEqual([
      {
        id: "channel:bgm",
        type: "audio-channel",
        loop: false,
        children: [
          { id: "bgm:intro", type: "sound", loop: false },
          { id: "bgm:theme", type: "sound", loop: false },
        ],
      },
      {
        id: "channel:voice",
        type: "audio-channel",
        loop: true,
        children: [{ id: "voice:line", type: "sound", loop: false }],
      },
    ]);
    expect(renderState.audio[0].children[0].loop).toBe(true);
  });

  it("leaves legacy audio channels unchanged", () => {
    const renderState = {
      audio: [
        {
          id: "channel:bgm",
          type: "audio-channel",
          children: [{ id: "bgm:default", type: "sound", loop: true }],
        },
      ],
    };

    expect(
      prepareRenderStateAudioChannelsForGraphics({
        renderState,
        presentationState: {
          bgm: {
            resourceId: "theme",
            loop: true,
          },
        },
      }),
    ).toBe(renderState);
  });
});
