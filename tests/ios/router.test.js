import { afterEach, describe, expect, it, vi } from "vitest";

import IOSRouter from "../../src/deps/clients/ios/router.js";

const ROUTER_STACK_STORAGE_KEY = "routevn.ios.router.stack.v1";

const createStorageMock = () => {
  const entries = new Map();

  return {
    getItem: vi.fn((key) => entries.get(key) ?? undefined),
    setItem: vi.fn((key, value) => {
      entries.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      entries.delete(key);
    }),
  };
};

const installStorage = (storage) => {
  vi.stubGlobal("window", {
    sessionStorage: storage,
  });
};

describe("ios router", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the route stack after a WebView reload", () => {
    const storage = createStorageMock();
    installStorage(storage);

    const router = new IOSRouter({ initialPath: "/projects" });
    router.redirect("/project", { p: "project-1" });
    router.redirect("/project/images", {
      p: "project-1",
      folderId: "folder-1",
    });

    const reloadedRouter = new IOSRouter({ initialPath: "/projects" });

    expect(reloadedRouter.getPathName()).toBe("/project/images");
    expect(reloadedRouter.getPayload()).toEqual({
      p: "project-1",
      folderId: "folder-1",
    });
    expect(reloadedRouter.canGoBack()).toBe(true);
    expect(reloadedRouter.stack).toEqual([
      "/projects",
      "/project?p=project-1",
      "/project/images?p=project-1&folderId=folder-1",
    ]);
  });

  it("updates the persisted stack when navigating back", () => {
    const storage = createStorageMock();
    installStorage(storage);

    const router = new IOSRouter({ initialPath: "/projects" });
    router.redirect("/project", { p: "project-1" });
    router.redirect("/project/images", { p: "project-1" });

    router.back();

    const reloadedRouter = new IOSRouter({ initialPath: "/projects" });
    expect(reloadedRouter.getPathName()).toBe("/project");
    expect(reloadedRouter.getPayload()).toEqual({ p: "project-1" });
    expect(reloadedRouter.stack).toEqual(["/projects", "/project?p=project-1"]);
  });

  it("returns the previous route without changing the stack", () => {
    const storage = createStorageMock();
    installStorage(storage);
    const router = new IOSRouter({ initialPath: "/projects" });
    router.redirect("/project", { p: "project-1" });
    router.redirect(
      "/project/scene-editor",
      { p: "project-1", s: "scene-1" },
      { state: { source: "scene-map" } },
    );

    expect(router.getBackTarget()).toEqual({
      path: "/project",
      payload: { p: "project-1" },
      historyState: {},
    });
    expect(router.getPathName()).toBe("/project/scene-editor");
  });

  it("ignores invalid persisted stacks", () => {
    const storage = createStorageMock();
    storage.setItem(ROUTER_STACK_STORAGE_KEY, JSON.stringify([]));
    installStorage(storage);

    const router = new IOSRouter({ initialPath: "/projects" });

    expect(router.getPathName()).toBe("/projects");
    expect(storage.removeItem).toHaveBeenCalledWith(ROUTER_STACK_STORAGE_KEY);
  });
});
