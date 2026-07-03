import { describe, expect, it, vi } from "vitest";
import { handleBackButtonKeyDown } from "../../src/pages/project/project.handlers.js";

const createDeps = () => ({
  appService: {
    navigate: vi.fn(),
  },
});

const createKeyEvent = (key) => ({
  key,
  preventDefault: vi.fn(),
});

describe("project page handlers", () => {
  it("activates Back to Projects from Enter and Space", () => {
    const deps = createDeps();
    const enterEvent = createKeyEvent("Enter");
    const spaceEvent = createKeyEvent(" ");

    handleBackButtonKeyDown(deps, {
      _event: enterEvent,
    });
    handleBackButtonKeyDown(deps, {
      _event: spaceEvent,
    });

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(spaceEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(1, "/projects");
    expect(deps.appService.navigate).toHaveBeenNthCalledWith(2, "/projects");
  });

  it("ignores unrelated Back to Projects key presses", () => {
    const deps = createDeps();
    const event = createKeyEvent("ArrowRight");

    handleBackButtonKeyDown(deps, {
      _event: event,
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });
});
