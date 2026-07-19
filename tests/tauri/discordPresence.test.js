import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { setDiscordPresenceDetails } from "../../src/deps/clients/tauri/discordPresence.js";

describe("Tauri Discord presence client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("updates the Discord activity details", async () => {
    invokeMock.mockResolvedValue(undefined);

    await setDiscordPresenceDetails({
      details: "Localized presence details",
    });

    expect(invokeMock).toHaveBeenCalledWith("set_discord_presence_details", {
      details: "Localized presence details",
    });
  });
});
