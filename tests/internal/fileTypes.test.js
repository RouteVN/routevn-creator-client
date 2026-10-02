import { describe, expect, it } from "vitest";
import { detectAudioMimeTypeFromBytes } from "../../src/internal/fileTypes.js";

const ascii = (text) => Array.from(text, (char) => char.charCodeAt(0));

describe("detectAudioMimeTypeFromBytes", () => {
  it.each([
    ["OGG", [...ascii("OggS"), 0, 2], "audio/ogg"],
    ["WAV", [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")], "audio/wav"],
    ["MP3 with an ID3 tag", [...ascii("ID3"), 4, 0], "audio/mpeg"],
    ["MP3 frame without a tag", [0xff, 0xfb, 0x90, 0x64], "audio/mpeg"],
  ])("detects %s", (_label, bytes, mimeType) => {
    expect(detectAudioMimeTypeFromBytes(new Uint8Array(bytes).buffer)).toBe(
      mimeType,
    );
  });

  it.each([
    ["AAC ADTS", [0xff, 0xf1, 0x50, 0x80]],
    ["PNG", [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a]],
    ["RIFF without WAVE", [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]],
    ["text", ascii("audio-bytes")],
    ["short input", [0x4f, 0x67]],
    ["empty input", []],
  ])("rejects %s", (_label, bytes) => {
    expect(
      detectAudioMimeTypeFromBytes(new Uint8Array(bytes).buffer),
    ).toBeUndefined();
  });

  it("reads typed array views from their byte offset", () => {
    const bytes = new Uint8Array([0, 0, ...ascii("OggS"), 0, 2]);
    expect(detectAudioMimeTypeFromBytes(bytes.subarray(2))).toBe("audio/ogg");
  });
});
