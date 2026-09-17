import { describe, expect, it, vi } from "vitest";
import { createBrowserEventsClient } from "../../src/deps/clients/browserEvents.js";
import * as mediaStore from "../../src/components/mediaResourcesView/mediaResourcesView.store.js";
import * as mediaHandlers from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import * as catalogStore from "../../src/components/catalogResourcesView/catalogResourcesView.store.js";
import * as catalogHandlers from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";
import * as textStyleStore from "../../src/components/textStyleResourcesView/textStyleResourcesView.store.js";
import * as textStyleHandlers from "../../src/components/textStyleResourcesView/textStyleResourcesView.handlers.js";

const resourceViews = [
  ["media", mediaStore, mediaHandlers],
  ["catalog", catalogStore, catalogHandlers],
  ["text styles", textStyleStore, textStyleHandlers],
];

const createDeps = (storeModule, { width, savedColumns, props = {} }) => {
  const viewProps = {
    mobileLayout: true,
    showZoomControls: true,
    zoomControlMode: "columns",
    itemsPerRowConfigKey: "resourceView.itemsPerRow",
    ...props,
  };
  const state = storeModule.createInitialState({ props: viewProps });
  const store = Object.fromEntries(
    Object.entries(storeModule).map(([name, fn]) => [
      name,
      (payload) => fn({ state, props: viewProps }, payload),
    ]),
  );
  const windowTarget = new EventTarget();
  windowTarget.innerWidth = width;
  const config = new Map([["resourceView.mobileItemsPerRow", savedColumns]]);
  const deps = {
    props: viewProps,
    store,
    render: vi.fn(),
    browserEventsClient: createBrowserEventsClient({ windowTarget }),
    appService: {
      getUserConfig: (key) => config.get(key),
      setUserConfig: vi.fn((key, value) => config.set(key, value)),
    },
  };
  return { deps, windowTarget };
};

describe.each(resourceViews)(
  "%s responsive resource columns",
  (_name, store, handlers) => {
    it.each([
      [390, 2],
      [767, 2],
      [768, 6],
      [1024, 6],
    ])("starts with %i px width and %i columns", (width, columns) => {
      const { deps } = createDeps(store, { width });
      const cleanup = handlers.handleBeforeMount(deps);

      expect(deps.store.selectItemsPerRow()).toBe(columns);
      expect(deps.appService.setUserConfig).not.toHaveBeenCalled();
      cleanup();
    });

    it("updates the default when resized and stops listening after unmount", () => {
      const { deps, windowTarget } = createDeps(store, { width: 390 });
      const cleanup = handlers.handleBeforeMount(deps);

      windowTarget.innerWidth = 768;
      windowTarget.dispatchEvent(new Event("resize"));
      expect(deps.store.selectItemsPerRow()).toBe(6);
      expect(deps.render).toHaveBeenCalledOnce();
      windowTarget.innerWidth = 1024;
      windowTarget.dispatchEvent(new Event("resize"));
      expect(deps.render).toHaveBeenCalledOnce();
      windowTarget.innerWidth = 600;
      windowTarget.dispatchEvent(new Event("resize"));
      expect(deps.store.selectItemsPerRow()).toBe(2);
      cleanup();
      windowTarget.innerWidth = 768;
      windowTarget.dispatchEvent(new Event("resize"));
      expect(deps.store.selectItemsPerRow()).toBe(2);
    });

    it("keeps the user's chosen columns across resizing and reopening", () => {
      const { deps, windowTarget } = createDeps(store, {
        width: 768,
        savedColumns: 3,
      });
      const cleanup = handlers.handleBeforeMount(deps);
      expect(deps.store.selectItemsPerRow()).toBe(3);
      handlers.handleZoomOut(deps);
      expect(deps.store.selectItemsPerRow()).toBe(4);
      expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
        "resourceView.mobileItemsPerRow",
        4,
      );
      windowTarget.innerWidth = 390;
      windowTarget.dispatchEvent(new Event("resize"));
      expect(deps.store.selectItemsPerRow()).toBe(4);
      cleanup();
      const dispose = handlers.handleBeforeMount(deps);
      expect(deps.store.selectItemsPerRow()).toBe(4);
      dispose();
    });

    it("preserves an explicit desktop default", () => {
      const { deps } = createDeps(store, {
        width: 1024,
        props: { mobileLayout: false, defaultItemsPerRow: 6 },
      });
      const cleanup = handlers.handleBeforeMount(deps);
      expect(deps.store.selectItemsPerRow()).toBe(6);
      cleanup();
    });
  },
);
