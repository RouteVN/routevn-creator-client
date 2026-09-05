import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { h } from "snabbdom/build/h.js";
import { init } from "snabbdom/build/init.js";
import { attributesModule } from "snabbdom/build/modules/attributes.js";
import { propsModule } from "snabbdom/build/modules/props.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import { parse } from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/index.js";
import { loadViewTemplate } from "../support/renderView.js";
import {
  handleBeforeMount,
  handleOnUpdate,
} from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import * as mediaStore from "../../src/components/mediaResourcesView/mediaResourcesView.store.js";

afterEach(() => vi.unstubAllGlobals());

const sound = (id) => ({
  id,
  cardKind: "sound",
  waveformDataFileId: `waveform-${id}`,
});

const createHydratedSounds = () => {
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
        children: Array.from({ length: 5 }, (_, index) =>
          sound(`sound-${index}`),
        ),
      },
    ],
  };
  const state = mediaStore.createInitialState({ props });
  const store = Object.fromEntries(
    Object.entries(mediaStore).map(([name, fn]) => [
      name,
      (payload) => fn({ state, props }, payload),
    ]),
  );
  const deps = { props, store, render: vi.fn() };
  const cleanup = handleBeforeMount(deps);
  for (let index = 0; index < 16; index++) advanceFrame();
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

describe("media resource waveform hydration", () => {
  it.each([false, true])(
    "retains waveform canvas elements after insertion and resizing (mobile=%s)",
    (mobileLayout) => {
      const { deps, cleanup } = createHydratedSounds();
      deps.props.mobileLayout = mobileLayout;
      const dom = new JSDOM("<body><div id='root'></div></body>");
      vi.stubGlobal("document", dom.window.document);
      dom.window.customElements.define(
        "rvn-waveform-visualizer",
        class extends dom.window.HTMLElement {
          constructor() {
            super();
            this.attachShadow({ mode: "open" }).append(
              dom.window.document.createElement("canvas"),
            );
          }
        },
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
      const findWaveform = (id) =>
        tree.elm.querySelector(
          `[data-item-id='${id}'] rvn-waveform-visualizer`,
        );
      try {
        render();
        const originals = deps.props.groups[0].children.map((item) => {
          const waveform = findWaveform(item.id);
          return {
            id: item.id,
            waveform,
            canvas: waveform.shadowRoot.querySelector("canvas"),
          };
        });
        deps.props.groups[0].children.unshift(sound("new-sound"));
        render();
        handleOnUpdate(deps);
        render();
        deps.store.setZoomLevel({ zoomLevel: 2 });
        render();
        originals.forEach(({ id, waveform, canvas }) => {
          expect(findWaveform(id)).toBe(waveform);
          expect(waveform.shadowRoot.querySelector("canvas")).toBe(canvas);
        });
      } finally {
        cleanup();
        dom.window.close();
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
      for (let frame = 0; frame < 8; frame++) {
        advanceFrame();
        expectWaveformsVisible(deps, existingIds);
      }
      expectWaveformsVisible(deps, [...existingIds, "new-sound"]);
      cleanup();
    },
  );

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
