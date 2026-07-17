import { afterEach, describe, expect, it, vi } from "vitest";
import WebRouter from "../../src/deps/clients/router.js";

const setLocationFromPath = (location, path) => {
  const [pathname, query = ""] = String(path).split("?");
  location.pathname = pathname;
  location.search = query ? `?${query}` : "";
};

const createWindowMock = () => {
  const location = {
    pathname: "/project/scene-editor",
    search: "?p=project-1",
  };
  const history = {
    state: {},
    replaceState: vi.fn((state, _title, path) => {
      history.state = state;
      setLocationFromPath(location, path);
    }),
    pushState: vi.fn((state, _title, path) => {
      history.state = state;
      setLocationFromPath(location, path);
    }),
    back: vi.fn(),
    go: vi.fn(),
  };

  return {
    addEventListener: vi.fn(),
    location,
    removeEventListener: vi.fn(),
    history,
  };
};

describe("web router payload updates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not replace history when the payload URL is unchanged", () => {
    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();

    router.setPayload({ p: "project-1" });

    expect(windowMock.history.replaceState).not.toHaveBeenCalled();
  });

  it("subscribes the app shell to browser history changes", () => {
    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();
    const listener = vi.fn();

    const unsubscribe = router.subscribePopState(listener);
    const popStateHandler = windowMock.addEventListener.mock.calls[0][1];

    expect(windowMock.addEventListener).toHaveBeenCalledWith(
      "popstate",
      popStateHandler,
    );

    popStateHandler({ type: "popstate" });
    expect(listener).toHaveBeenCalledWith({ type: "popstate" });

    unsubscribe();

    expect(windowMock.removeEventListener).toHaveBeenCalledWith(
      "popstate",
      popStateHandler,
    );
  });

  it("restores a failed pop without dispatching another route pop", () => {
    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();
    const listener = vi.fn();
    router.subscribePopState(listener);
    const popStateHandler = windowMock.addEventListener.mock.calls[0][1];
    const destinationState = { ...windowMock.history.state };
    router.redirect("/projects", {});
    popStateHandler({ state: destinationState, type: "popstate" });
    listener.mockClear();

    router.restoreAfterFailedPop();
    popStateHandler({ state: windowMock.history.state, type: "popstate" });

    expect(windowMock.history.go).toHaveBeenCalledWith(1);
    expect(listener).not.toHaveBeenCalled();

    popStateHandler({ type: "popstate" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores across multiple pending pop entries", () => {
    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();
    router.subscribePopState(vi.fn());
    const popStateHandler = windowMock.addEventListener.mock.calls[0][1];
    const oldestState = { ...windowMock.history.state };
    router.redirect("/project/characters", { p: "project-1" });
    router.redirect("/project/character-sprites", {
      characterId: "character-1",
      p: "project-1",
    });

    popStateHandler({ state: oldestState, type: "popstate" });
    router.restoreAfterFailedPop();

    expect(windowMock.history.go).toHaveBeenCalledWith(2);
  });

  it("coalesces throttled payload writes and exposes the pending payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();

    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-1" },
      { throttleMs: 250 },
    );

    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(1);
    expect(windowMock.location.search).toBe(
      "?p=project-1&sectionId=section-1&lineId=line-1",
    );

    vi.setSystemTime(1050);
    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-2" },
      { throttleMs: 250 },
    );
    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-3" },
      { throttleMs: 250 },
    );

    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(1);
    expect(router.getPayload()).toMatchObject({
      sectionId: "section-1",
      lineId: "line-3",
    });

    vi.advanceTimersByTime(199);
    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(2);
    expect(windowMock.location.search).toBe(
      "?p=project-1&sectionId=section-1&lineId=line-3",
    );
  });

  it("clears pending payload writes before navigation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();

    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-1" },
      { throttleMs: 250 },
    );
    vi.setSystemTime(1050);
    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-2" },
      { throttleMs: 250 },
    );

    router.redirect("/projects", { p: "project-1" });
    vi.advanceTimersByTime(250);

    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(1);
    expect(windowMock.history.pushState).toHaveBeenCalledWith(
      {},
      "",
      "/projects?p=project-1",
    );
    expect(windowMock.location.pathname).toBe("/projects");
    expect(windowMock.location.search).toBe("?p=project-1");
  });

  it("drops pending payload writes when the path changes outside the router", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();

    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-1" },
      { throttleMs: 250 },
    );
    vi.setSystemTime(1050);
    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-2" },
      { throttleMs: 250 },
    );

    setLocationFromPath(windowMock.location, "/projects?p=project-1");
    vi.advanceTimersByTime(250);

    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(1);
    expect(windowMock.location.pathname).toBe("/projects");
    expect(windowMock.location.search).toBe("?p=project-1");
  });

  it("drops pending payload writes when the same path query changes outside the router", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const windowMock = createWindowMock();
    vi.stubGlobal("window", windowMock);
    const router = new WebRouter();

    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-1" },
      { throttleMs: 250 },
    );
    vi.setSystemTime(1050);
    router.setPayload(
      { p: "project-1", sectionId: "section-1", lineId: "line-2" },
      { throttleMs: 250 },
    );

    setLocationFromPath(
      windowMock.location,
      "/project/scene-editor?p=project-2",
    );
    vi.advanceTimersByTime(250);

    expect(windowMock.history.replaceState).toHaveBeenCalledTimes(1);
    expect(windowMock.location.pathname).toBe("/project/scene-editor");
    expect(windowMock.location.search).toBe("?p=project-2");
  });
});
