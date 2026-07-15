import { describe, expect, it } from "vitest";
import {
  createNativeApplicationIdentifier,
  isValidNativeApplicationIdentifier,
  requireNativeApplicationIdentifier,
} from "../../src/internal/nativeApplicationIdentifier.js";

describe("native application identifiers", () => {
  it("creates the approved persisted identifier shape", () => {
    expect(
      createNativeApplicationIdentifier({ idGenerator: () => "123456789ABC" }),
    ).toBe("vn.routevn.player.123456789ABC");
  });

  it("validates reverse-domain identifiers", () => {
    expect(isValidNativeApplicationIdentifier("vn.routevn.player.Game-1")).toBe(
      true,
    );
    expect(isValidNativeApplicationIdentifier("vn_routevn_player_Game_1")).toBe(
      false,
    );
    expect(() =>
      requireNativeApplicationIdentifier("invalid identifier"),
    ).toThrow("Native application identifier must use reverse-domain notation");
  });
});
