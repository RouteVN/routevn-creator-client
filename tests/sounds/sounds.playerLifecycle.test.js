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
import { EN_I18N } from "../support/i18n.js";
import * as soundsStore from "../../src/pages/sounds/sounds.store.js";
import * as playerStore from "../../src/components/audioPlayer/audioPlayer.store.js";
import * as playerHandlers from "../../src/components/audioPlayer/audioPlayer.handlers.js";

afterEach(() => vi.unstubAllGlobals());

const mountSounds = () => {
  const dom = new JSDOM("<body><div id='root'></div></body>");
  for (const name of ["window", "document", "HTMLElement", "CustomEvent"]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.stubGlobal(
    "CSSStyleSheet",
    class {
      replaceSync() {}
    },
  );
  const release = vi.fn();
  const audioService = {
    acquire: vi.fn(() => release),
    on: vi.fn(),
    off: vi.fn(),
    loadAudio: vi.fn(async () => ({ duration: 60 })),
    play: vi.fn(async () => {}),
    stop: vi.fn(),
  };
  const getFileContent = vi.fn(async (id) => ({
    url: `https://example.com/${id}`,
  }));
  const readPlayerYaml = (suffix) =>
    yaml.load(
      readFileSync(
        new URL(
          `../../src/components/audioPlayer/audioPlayer.${suffix}.yaml`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const view = readPlayerYaml("view");
  view.template = parse(view.template);
  dom.window.customElements.define(
    "rvn-audio-player",
    createComponent(
      {
        view,
        schema: readPlayerYaml("schema"),
        store: playerStore,
        handlers: playerHandlers,
      },
      { audioService, projectService: { getFileContent }, i18n: EN_I18N },
    ),
  );

  const context = { state: soundsStore.createInitialState(), i18n: EN_I18N };
  soundsStore.setUiConfig(context, { uiConfig: { id: "touch" } });
  soundsStore.setItems(context, {
    data: {
      tree: [{ id: "sound-1" }, { id: "sound-2" }],
      items: Object.fromEntries(
        [1, 2].map((n) => [
          `sound-${n}`,
          {
            id: `sound-${n}`,
            type: "sound",
            name: `Sound ${n}`,
            fileId: `file-${n}`,
          },
        ]),
      ),
    },
  });
  soundsStore.setSelectedItemId(context, {
    itemId: "sound-1",
    suppressMobileDetailSheet: true,
  });
  soundsStore.openAudioPlayer(context, {
    fileId: "file-1",
    fileName: "Sound 1",
  });
  const template = parse(loadViewTemplate("src/pages/sounds/sounds.view.yaml"));
  const patch = init([attributesModule, propsModule]);
  let tree = dom.window.document.querySelector("#root");
  const render = async () => {
    tree = patch(
      tree,
      parseView({
        h,
        template,
        viewData: soundsStore.selectViewData(context),
        wireEventListeners: false,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    context,
    render,
    audioService,
    release,
    getFileContent,
    player: () => tree.elm.querySelector("rvn-audio-player"),
    close: () => dom.window.close(),
  };
};

describe("Sounds playback lifecycle", () => {
  it("keeps the playing instance and audio load when selection opens and closes a sheet", async () => {
    const app = mountSounds();
    try {
      await app.render();
      const player = app.player();
      expect(app.audioService.play).toHaveBeenCalledOnce();
      for (const itemId of ["sound-2", "sound-1", undefined, "sound-2"]) {
        soundsStore.setSelectedItemId(app.context, { itemId });
        await app.render();
        expect(app.player()).toBe(player);
        expect(app.release).not.toHaveBeenCalled();
        expect(app.audioService.acquire).toHaveBeenCalledOnce();
        expect(app.audioService.loadAudio).toHaveBeenCalledOnce();
        expect(app.audioService.play).toHaveBeenCalledOnce();
      }
      // Selecting a card leaves playback alone; explicitly playing it still
      // switches files through the existing player's update handler.
      soundsStore.openAudioPlayer(app.context, {
        fileId: "file-2",
        fileName: "Sound 2",
      });
      await app.render();
      expect(app.player()).toBe(player);
      expect(app.audioService.stop).toHaveBeenCalledOnce();
      expect(app.audioService.loadAudio).toHaveBeenLastCalledWith(
        "https://example.com/file-2",
      );
      soundsStore.closeAudioPlayer(app.context);
      await app.render();
      expect(app.player()).toBeNull();
      expect(app.release).toHaveBeenCalledOnce();
    } finally {
      app.close();
    }
  });
});
