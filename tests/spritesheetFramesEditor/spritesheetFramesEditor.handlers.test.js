import { produce } from "immer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import * as storeModule from "../../src/components/spritesheetFramesEditor/spritesheetFramesEditor.store.js";
import {
  handleAddPicturesClick,
  handleEntryHoldChange,
  handleLoadSpritesheet,
} from "../../src/components/spritesheetFramesEditor/spritesheetFramesEditor.handlers.js";

// Runs store actions through Immer, as the component store does.
const createStore = () => {
  let state = storeModule.createInitialState();
  const store = {
    get state() {
      return state;
    },
  };
  for (const [name, fn] of Object.entries(storeModule)) {
    if (name === "createInitialState") {
      continue;
    }
    store[name] = name.startsWith("select")
      ? (payload) => fn({ state, i18n: EN_I18N }, payload)
      : (payload) => {
          state = produce(state, (draft) => {
            fn({ state: draft }, payload);
          });
        };
  }
  return store;
};

const atlasFrame = (x) => ({
  frame: { x, y: 0, w: 16, h: 16 },
  sourceSize: { w: 16, h: 16 },
});

// A spritesheet saved from the editor, with two frame pictures.
const savedSpritesheet = {
  id: "spritesheet-1",
  type: "spritesheet",
  name: "Blink",
  fileId: "sheet-file",
  jsonData: {
    frames: { "0.png": atlasFrame(0), walk_1: atlasFrame(18) },
  },
  animations: { default: { frames: [1, 0], fps: 12, loop: true } },
  frameSource: {
    frameWidth: 16,
    frameHeight: 16,
    frames: [{ fileId: "file-0" }, { fileId: "file-1" }],
  },
};

const createDeps = () => ({
  store: createStore(),
  i18n: EN_I18N,
  render: vi.fn(),
  dispatchEvent: vi.fn(),
  appService: {
    pickFiles: vi.fn(async () => [
      new File(["png"], "new.png", { type: "image/png" }),
    ]),
    showToast: vi.fn(),
    showAlert: vi.fn(),
  },
  projectService: {
    loadSpritesheetFrameFileIds: vi.fn(async ({ fileIds }) =>
      fileIds.map((fileId) => ({
        fileId,
        url: `blob:${fileId}`,
        width: 16,
        height: 16,
      })),
    ),
    readSpritesheetFrameFiles: vi.fn(async ({ files }) => ({
      frames: files.map((file) => ({
        name: file.name.replace(/\.png$/, ""),
        file,
        url: `blob:${file.name}`,
        width: 16,
        height: 16,
      })),
      failedFiles: [],
    })),
    renderSpritesheetFramesPreview: vi.fn(async () => ({
      blob: new Blob(["sheet"], { type: "image/png" }),
    })),
  },
});

// Lets a preview started without waiting for it finish.
const flushPreview = () => new Promise((resolve) => setTimeout(resolve, 0));

const changeHold = (deps, { index, hold }) => {
  const entryKey = deps.store.selectViewData().entries[index].key;
  handleEntryHoldChange(deps, {
    _event: {
      detail: { value: hold },
      currentTarget: { dataset: { entryKey } },
    },
  });
};

describe("spritesheetFramesEditor handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("remembers where each saved frame is in the sheet", async () => {
    const deps = createDeps();

    await handleLoadSpritesheet(deps, { spritesheet: savedSpritesheet });

    expect(
      deps.store.state.frames.map(({ name, fileId, sourceIndex }) => ({
        name,
        fileId,
        sourceIndex,
      })),
    ).toEqual([
      { name: "0", fileId: "file-0", sourceIndex: 0 },
      { name: "walk_1", fileId: "file-1", sourceIndex: 1 },
    ]);
  });

  it("ignores pictures until the frames have loaded", async () => {
    const deps = createDeps();
    deps.store.startLoading();

    await handleAddPicturesClick(deps);

    expect(
      deps.projectService.readSpritesheetFrameFiles,
    ).not.toHaveBeenCalled();
    expect(deps.store.state.frames).toEqual([]);
  });

  it("reuses the preview sheet until a picture is added", async () => {
    const deps = createDeps();
    const { renderSpritesheetFramesPreview } = deps.projectService;
    await handleLoadSpritesheet(deps, { spritesheet: savedSpritesheet });
    expect(renderSpritesheetFramesPreview).toHaveBeenCalledTimes(1);
    const previewUrl = deps.store.selectPreviewUrl();

    changeHold(deps, { index: 0, hold: 3 });
    await flushPreview();

    expect(renderSpritesheetFramesPreview).toHaveBeenCalledTimes(1);
    expect(deps.store.selectPreviewUrl()).toBe(previewUrl);
    expect(deps.store.state.preview.animations.default.frames).toEqual([
      1, 1, 1, 0,
    ]);

    await handleAddPicturesClick(deps);
    await flushPreview();

    expect(renderSpritesheetFramesPreview).toHaveBeenCalledTimes(2);
    expect(deps.store.selectPreviewUrl()).not.toBe(previewUrl);
  });

  it("frees the previous preview image when a preview fails", async () => {
    const deps = createDeps();
    await handleLoadSpritesheet(deps, { spritesheet: savedSpritesheet });
    const previewUrl = deps.store.selectPreviewUrl();
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");
    deps.projectService.renderSpritesheetFramesPreview.mockRejectedValue(
      new Error("canvas failed"),
    );

    await handleAddPicturesClick(deps);
    await flushPreview();

    expect(revokeObjectURL).toHaveBeenCalledWith(previewUrl);
    expect(deps.store.state.preview).toMatchObject({
      url: undefined,
      error: { code: "preview_failed" },
    });
    expect(deps.store.selectViewData().previewErrorMessage).toBe(
      "Couldn't draw the preview.\n\nDetails:\ncanvas failed",
    );
  });

  it("draws the preview from the layout it already made", async () => {
    const deps = createDeps();

    await handleLoadSpritesheet(deps, { spritesheet: savedSpritesheet });

    const [output] =
      deps.projectService.renderSpritesheetFramesPreview.mock.calls[0];
    expect(Object.keys(output.jsonData.frames)).toEqual(["0.png", "walk_1"]);
    expect(deps.store.state.preview.atlas).toBe(output.jsonData);
  });
});
