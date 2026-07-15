import { describe, expect, it, vi } from "vitest";
import { setupFileDropNavigationGuard } from "../../src/deps/clients/tauri/fileDropNavigation.js";

const createTarget = () => {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: vi.fn((eventName, listener) => {
      listeners.set(eventName, listener);
    }),
    removeEventListener: vi.fn((eventName) => {
      listeners.delete(eventName);
    }),
  };
};

describe("Tauri file drop navigation guard", () => {
  it.each([
    { types: ["Files"] },
    { items: [{ kind: "file" }] },
    { files: [{ name: "hero.png" }] },
  ])("prevents browser navigation for file drags", (dataTransfer) => {
    const target = createTarget();
    setupFileDropNavigationGuard({ target });
    const dragOverEvent = {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const dropEvent = {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    target.listeners.get("dragover")(dragOverEvent);
    target.listeners.get("drop")(dropEvent);

    expect(dragOverEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dragOverEvent.stopPropagation).not.toHaveBeenCalled();
    expect(dropEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("leaves non-file drag behavior unchanged", () => {
    const target = createTarget();
    setupFileDropNavigationGuard({ target });
    const event = {
      dataTransfer: {
        types: ["text/plain"],
        items: [{ kind: "string" }],
      },
      preventDefault: vi.fn(),
    };

    target.listeners.get("dragover")(event);
    target.listeners.get("drop")(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("registers capture listeners and removes them during cleanup", () => {
    const target = createTarget();
    const cleanup = setupFileDropNavigationGuard({ target });

    expect(target.addEventListener).toHaveBeenCalledWith(
      "dragover",
      expect.any(Function),
      { capture: true },
    );
    expect(target.addEventListener).toHaveBeenCalledWith(
      "drop",
      expect.any(Function),
      { capture: true },
    );

    cleanup();

    expect(target.removeEventListener).toHaveBeenCalledWith(
      "dragover",
      expect.any(Function),
      { capture: true },
    );
    expect(target.removeEventListener).toHaveBeenCalledWith(
      "drop",
      expect.any(Function),
      { capture: true },
    );
  });
});
