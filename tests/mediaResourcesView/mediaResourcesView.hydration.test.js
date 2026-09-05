import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { h } from "snabbdom/build/h.js";
import { init } from "snabbdom/build/init.js";
import { attributesModule } from "snabbdom/build/modules/attributes.js";
import { propsModule } from "snabbdom/build/modules/props.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import createComponent from "../../node_modules/@rettangoli/fe/src/createComponent.js";
import { parse } from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/index.js";
import { loadViewTemplate } from "../support/renderView.js";
import {
  handleBeforeMount,
  handleOnUpdate,
} from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import * as mediaStore from "../../src/components/mediaResourcesView/mediaResourcesView.store.js";
import * as waveformStore from "../../src/components/waveformVisualizer/waveformVisualizer.store.js";
import * as waveformHandlers from "../../src/components/waveformVisualizer/waveformVisualizer.handlers.js";

afterEach(() => vi.unstubAllGlobals());

const sound = (id) => ({
  id,
  cardKind: "sound",
  waveformDataFileId: `waveform-${id}`,
});

const createHydratedSounds = ({
  itemCount = 5,
  framesToHydrate = 16,
  props: extraProps = {},
} = {}) => {
  let frameId = 0;
  const frames = new Map();
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id) => frames.delete(id));
  const advanceFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  const props = {
    progressiveRender: true,
    lazySoundWaveforms: true,
    groups: [
      {
        id: "folder-1",
        children: Array.from({ length: itemCount }, (_, index) =>
          sound(`sound-${index}`),
        ),
      },
    ],
  };
  Object.assign(props, extraProps);
  const state = mediaStore.createInitialState({ props });
  const store = Object.fromEntries(
    Object.entries(mediaStore).map(([name, fn]) => [
      name,
      (payload) => fn({ state, props }, payload),
    ]),
  );
  const deps = { props, store, render: vi.fn() };
  const cleanup = handleBeforeMount(deps);
  for (let index = 0; index < framesToHydrate; index++) advanceFrame();
  return { deps, advanceFrame, cleanup };
};

const expectWaveformsVisible = (deps, ids) => {
  const items = deps.store
    .selectViewData()
    .groups.flatMap((group) => group.children);
  ids.forEach((id) => {
    expect(items.find((item) => item.id === id)).toMatchObject({
      shouldRenderWaveform: true,
    });
  });
};

const mountSounds = (deps) => {
  const dom = new JSDOM("<body><div id='root'></div></body>");
  for (const name of ["document", "window", "HTMLElement", "CustomEvent"]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.stubGlobal(
    "CSSStyleSheet",
    class {
      replaceSync() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    width: 120,
    height: 60,
  });
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  dom.window.HTMLCanvasElement.prototype.getContext = () => context;
  const downloadMetadata = vi.fn(async () => ({ amplitudes: [64, 255] }));
  const loadWaveformYaml = (suffix) =>
    yaml.load(
      readFileSync(
        new URL(
          `../../src/components/waveformVisualizer/waveformVisualizer.${suffix}.yaml`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const view = loadWaveformYaml("view");
  view.template = parse(view.template);
  dom.window.customElements.define(
    "rvn-waveform-visualizer",
    createComponent(
      {
        view,
        schema: loadWaveformYaml("schema"),
        handlers: waveformHandlers,
        store: waveformStore,
      },
      { projectService: { downloadMetadata } },
    ),
  );
  const template = parse(
    loadViewTemplate(
      "src/components/mediaResourcesView/mediaResourcesView.view.yaml",
    ),
  );
  const patch = init([attributesModule, propsModule]);
  let tree = dom.window.document.querySelector("#root");
  const render = () => {
    tree = patch(
      tree,
      parseView({
        h,
        template,
        viewData: deps.store.selectViewData(),
        wireEventListeners: false,
      }),
    );
  };
  deps.render.mockImplementation(render);
  return {
    render,
    downloadMetadata,
    context,
    findWaveform: (id) =>
      tree.elm.querySelector(`[data-item-id='${id}'] rvn-waveform-visualizer`),
    close: () => dom.window.close(),
  };
};

describe("media resource waveform hydration", () => {
  it.each([false, true])(
    "retains loaded waveforms through real FE lifecycle moves, insertion and resizing (mobile=%s)",
    async (mobileLayout) => {
      const { deps, advanceFrame, cleanup } = createHydratedSounds();
      deps.props.mobileLayout = mobileLayout;
      const { render, findWaveform, downloadMetadata, context, close } =
        mountSounds(deps);
      try {
        render();
        await Promise.resolve();
        advanceFrame();
        expect(downloadMetadata).toHaveBeenCalledTimes(5);
        const originals = deps.props.groups[0].children.map((item) => {
          const waveform = findWaveform(item.id);
          expect(waveform.shadowRoot.querySelector("canvas")).not.toBeNull();
          return {
            id: item.id,
            waveform,
            canvas: waveform.shadowRoot.querySelector("canvas"),
          };
        });
        // A regression must be visible even while replacement requests hang.
        downloadMetadata.mockImplementation(() => new Promise(() => {}));
        context.clearRect.mockClear();
        deps.props.groups[0].children.reverse();
        render();
        handleOnUpdate(deps);
        render();
        deps.props.groups[0].children.unshift(sound("new-sound"));
        render();
        handleOnUpdate(deps);
        render();
        deps.store.setZoomLevel({ zoomLevel: 2 });
        render();
        advanceFrame();
        originals.forEach(({ id, waveform, canvas }) => {
          expect(findWaveform(id)).toBe(waveform);
          expect(waveform.shadowRoot.querySelector("canvas")).toBe(canvas);
        });
        expect(downloadMetadata).toHaveBeenCalledTimes(5);
        expect(context.clearRect).not.toHaveBeenCalled();
      } finally {
        cleanup();
        close();
      }
    },
  );

  it.each([0, 2, 5])(
    "preserves existing waveforms when adding a sound at index %s",
    (index) => {
      const { deps, advanceFrame, cleanup } = createHydratedSounds();
      const existingIds = deps.props.groups[0].children.map((item) => item.id);
      expectWaveformsVisible(deps, existingIds);

      deps.props.groups[0].children.splice(index, 0, sound("new-sound"));
      // FE renders new props before calling handleOnUpdate.
      expectWaveformsVisible(deps, existingIds);
      handleOnUpdate(deps);
      expectWaveformsVisible(deps, existingIds);
      const addedItem = () =>
        deps.store
          .selectViewData()
          .groups[0].children.find((item) => item.id === "new-sound");
      expect(addedItem().shouldRenderWaveform).toBe(false);
      for (let frame = 0; frame < 8; frame++) {
        advanceFrame();
        expectWaveformsVisible(deps, existingIds);
      }
      expectWaveformsVisible(deps, [...existingIds, "new-sound"]);
      cleanup();
    },
  );

  it("keeps 96 deferred waveforms deferred when a hydrated sound moves to the end", async () => {
    const { deps, advanceFrame, cleanup } = createHydratedSounds({
      itemCount: 100,
      framesToHydrate: 8,
      props: { progressiveHydrationDelayFrameCount: 16 },
    });
    const { render, findWaveform, downloadMetadata, close } = mountSounds(deps);
    const enabledIds = () =>
      deps.store
        .selectViewData()
        .groups.flatMap((group) =>
          group.children
            .filter((item) => item.shouldRenderWaveform)
            .map((item) => item.id),
        );
    try {
      render();
      await Promise.resolve();
      expect(downloadMetadata).toHaveBeenCalledTimes(4);
      const waveform = findWaveform("sound-0");
      const canvas = waveform.shadowRoot.querySelector("canvas");
      expect(canvas).not.toBeNull();

      const items = deps.props.groups[0].children;
      items.push(items.shift());
      render();
      expect(enabledIds()).toEqual([
        "sound-1",
        "sound-2",
        "sound-3",
        "sound-0",
      ]);
      handleOnUpdate(deps);
      render();
      for (let frame = 0; frame < 7; frame++) {
        advanceFrame();
        expect(enabledIds()).toEqual([
          "sound-1",
          "sound-2",
          "sound-3",
          "sound-0",
        ]);
        expect(downloadMetadata).toHaveBeenCalledTimes(4);
        expect(findWaveform("sound-0")).toBe(waveform);
        expect(waveform.shadowRoot.querySelector("canvas")).toBe(canvas);
      }
      expect(deps.store.selectProgressiveRenderedItemCount()).toBe(8);
      expect(
        deps.store.selectViewData().groups[0].children[50].isPlaceholder,
      ).toBe(true);
      advanceFrame();
      await Promise.resolve();
      expect(enabledIds()).toEqual([
        "sound-1",
        "sound-2",
        "sound-3",
        "sound-4",
        "sound-5",
        "sound-6",
        "sound-7",
        "sound-0",
      ]);
      expect(downloadMetadata).toHaveBeenCalledTimes(8);
      expect(waveform.shadowRoot.querySelector("canvas")).toBe(canvas);
    } finally {
      cleanup();
      close();
    }
  });

  it("uses the latest pending identities without restarting an active batch delay", () => {
    const { deps, advanceFrame, cleanup } = createHydratedSounds({
      itemCount: 12,
      framesToHydrate: 8,
    });
    try {
      for (let frame = 0; frame < 7; frame++) {
        deps.props.groups[0].children.reverse();
        handleOnUpdate(deps);
        advanceFrame();
        expect(deps.store.selectSoundWaveformRenderedItemIds()).toHaveLength(4);
      }
      const items = deps.props.groups[0].children;
      deps.props.groups[0].children = items.filter(
        (item) => !["sound-0", "sound-11"].includes(item.id),
      );
      deps.props.groups[0].children.unshift(sound("new-sound"));
      handleOnUpdate(deps);
      advanceFrame();
      expect(deps.store.selectSoundWaveformRenderedItemIds()).toEqual([
        "new-sound",
        "sound-10",
        "sound-9",
        "sound-8",
        "sound-3",
        "sound-2",
        "sound-1",
      ]);
    } finally {
      cleanup();
    }
  });

  it("keeps the initial paint delay for newly appended waveforms", () => {
    const { deps, advanceFrame, cleanup } = createHydratedSounds();
    deps.props.groups[0].children.push(sound("new-sound"));
    handleOnUpdate(deps);
    for (let frame = 0; frame < 7; frame++) {
      advanceFrame();
      expect(
        deps.store.selectViewData().groups[0].children.at(-1)
          .shouldRenderWaveform,
      ).toBe(false);
    }
    advanceFrame();
    expectWaveformsVisible(deps, ["new-sound"]);
    cleanup();
  });

  it("preserves waveforms when the list is reordered or an item is removed", () => {
    const { deps, advanceFrame, cleanup } = createHydratedSounds();
    deps.props.groups[0].children.reverse();
    deps.props.groups[0].children.splice(2, 1);
    const remainingIds = deps.props.groups[0].children.map((item) => item.id);
    expectWaveformsVisible(deps, remainingIds);
    handleOnUpdate(deps);
    advanceFrame();
    expectWaveformsVisible(deps, remainingIds);
    cleanup();
  });

  it("does not restart hydration for selection or waveform-data changes", () => {
    const { deps, advanceFrame, cleanup } = createHydratedSounds();
    deps.render.mockClear();
    deps.props.selectedItemId = "sound-1";
    deps.props.groups[0].children[1].waveformDataFileId =
      "replacement-waveform";
    handleOnUpdate(deps);
    advanceFrame();
    expectWaveformsVisible(
      deps,
      deps.props.groups[0].children.map((item) => item.id),
    );
    expect(deps.render).not.toHaveBeenCalled();
    cleanup();
  });
});
