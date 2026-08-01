import { describe, expect, it, vi } from "vitest";
import { createBrowserEventsClient } from "../src/deps/clients/browserEvents.js";

describe("browserEventsClient", () => {
  it("subscribes to and removes window events", () => {
    const windowTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const client = createBrowserEventsClient({ windowTarget });
    const listener = vi.fn();
    const options = { capture: true };

    const cleanup = client.subscribeWindowEvent({
      type: "keydown",
      listener,
      options,
    });

    expect(windowTarget.addEventListener).toHaveBeenCalledWith(
      "keydown",
      listener,
      options,
    );

    cleanup();

    expect(windowTarget.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      listener,
      options,
    );
  });
});
