import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleDialogClose,
  handleDialogListKeyDown,
  handleDialogRowClick,
  handleOnUpdate,
  handlePanelRowClick,
  handlePanelRowKeyDown,
  handleShowAllClick,
} from "../../src/components/imageUsage/imageUsage.handlers.js";
import * as storeModule from "../../src/components/imageUsage/imageUsage.store.js";
import { EN_I18N } from "../support/i18n.js";

const USAGES = [
  {
    type: "scene",
    id: "scene-1",
    name: "Scene One",
    lines: [
      {
        sectionId: "section-1",
        sectionName: "Section One",
        lineId: "line-2",
        lineNumber: 2,
        actionType: "background",
      },
      {
        sectionId: "section-2",
        sectionName: "Section Two",
        lineId: "line-9",
        lineNumber: 4,
        actionType: "visual",
      },
    ],
  },
  {
    type: "scene",
    id: "scene-2",
    name: "Scene Two",
    lines: [
      {
        sectionId: "section-3",
        sectionName: "Section Three",
        lineId: "line-12",
        lineNumber: 1,
        actionType: "background",
      },
    ],
  },
  { type: "layout", id: "layout-1", name: "Layout One" },
  { type: "control", id: "control-1", name: "Control One" },
  { type: "animation", id: "animation-1", name: "Animation One" },
  { type: "particle", id: "particle-1", name: "Particle One", isShown: true },
  { type: "platformDetails", platform: "web", property: "iconFileId" },
];

// The component's real store over a real state, as the framework binds it.
const createStore = () => {
  const context = { state: storeModule.createInitialState() };
  const store = {};
  for (const [name, fn] of Object.entries(storeModule)) {
    if (name === "createInitialState" || name === "selectViewData") {
      continue;
    }
    store[name] = (payload) => fn(context, payload);
  }
  return { context, store };
};

const createDeps = ({
  usages = USAGES,
  usedImages = [],
  props = {},
  payload = { p: "project-1", s: "scene-9", sectionId: "old", lineId: "old" },
} = {}) => {
  const { context, store } = createStore();
  return {
    context,
    store,
    props: { imageId: "image-1", imageName: "Image One", ...props },
    i18n: EN_I18N,
    refs: { dialogList: { focus: vi.fn() } },
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    projectService: {
      getImageUsage: vi.fn(async () => ({ usages, blocksDelete: true })),
      getImageFolderUsage: vi.fn(async () => ({
        images: usedImages,
        blocksDelete: usedImages.length > 0,
      })),
    },
    appService: {
      getPayload: vi.fn(() => payload),
      navigate: vi.fn(),
      showToast: vi.fn(),
    },
  };
};

const createKeyEvent = (key) => ({
  _event: { key, preventDefault: vi.fn() },
});

const createRowEvent = (rowId) => ({
  _event: { currentTarget: { dataset: { rowId } } },
});

describe("imageUsage.handlers", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  beforeEach(() => {
    globalThis.requestAnimationFrame = (callback) => callback();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("loads where the image is used when it mounts", async () => {
    const deps = createDeps();

    await handleAfterMount(deps);

    expect(deps.projectService.getImageUsage).toHaveBeenCalledWith({
      imageId: "image-1",
    });
    expect(deps.context.state.status).toBe("ready");
    expect(deps.context.state.usages).toEqual(USAGES);
    expect(deps.render).toHaveBeenCalled();
  });

  it("loads the usage of the next image when the image changes", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);
    deps.store.openDialog();
    deps.projectService.getImageUsage.mockResolvedValue({
      usages: [],
      blocksDelete: false,
    });

    await handleOnUpdate(deps, {
      oldProps: { imageId: "image-1" },
      newProps: { imageId: "image-2" },
    });

    expect(deps.projectService.getImageUsage).toHaveBeenLastCalledWith({
      imageId: "image-2",
    });
    expect(deps.context.state.subjectId).toBe("image-2");
    expect(deps.context.state.usages).toEqual([]);
    expect(deps.context.state.isDialogOpen).toBe(false);
  });

  it("does not load again when only the image's name changes", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);

    await handleOnUpdate(deps, {
      oldProps: { imageId: "image-1", imageName: "Image One" },
      newProps: { imageId: "image-1", imageName: "Renamed" },
    });

    expect(deps.projectService.getImageUsage).toHaveBeenCalledTimes(1);
  });

  it("keeps the usage of the image shown now when an earlier image answers late", async () => {
    const deps = createDeps();
    let answerFirst;
    deps.projectService.getImageUsage
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = () => resolve({ usages: USAGES, blocksDelete: true });
          }),
      )
      .mockResolvedValueOnce({ usages: [], blocksDelete: false });

    const firstLoad = handleAfterMount(deps);
    await handleOnUpdate(deps, {
      oldProps: { imageId: "image-1" },
      newProps: { imageId: "image-2" },
    });
    answerFirst();
    await firstLoad;

    expect(deps.context.state.subjectId).toBe("image-2");
    expect(deps.context.state.usages).toEqual([]);
  });

  it("shows a failed load in the panel without a toast", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const deps = createDeps();
    deps.projectService.getImageUsage.mockRejectedValue(new Error("no scene"));

    await handleAfterMount(deps);
    consoleError.mockRestore();

    expect(deps.context.state.status).toBe("failed");
    expect(deps.appService.showToast).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("opens the full list from Show all and loads the usage again", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);

    await handleShowAllClick(deps);

    expect(deps.context.state.isDialogOpen).toBe(true);
    expect(deps.context.state.activeRowId).toBe("scene:scene-1");
    expect(deps.refs.dialogList.focus).toHaveBeenCalled();
    expect(deps.projectService.getImageUsage).toHaveBeenCalledTimes(2);
  });

  it("opens the scene editor at the first line that uses the image from a panel scene row", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);

    handlePanelRowClick(deps, createRowEvent("scene:scene-1"));

    // The line and section the editor had open before are left out.
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/scene-editor",
      {
        p: "project-1",
        s: "scene-1",
        sectionId: "section-1",
        entryLineId: "line-2",
      },
    );
  });

  it.each([
    [
      "layout:layout-1",
      "/project/layout-editor",
      { p: "project-1", s: "scene-9", l: "layout-1" },
    ],
    [
      "control:control-1",
      "/project/layout-editor",
      { p: "project-1", s: "scene-9", c: "control-1" },
    ],
    ["animation:animation-1", "/project/animation-editor", undefined],
    ["particle:particle-1", "/project/particle-editor", undefined],
    [
      "platformDetails:web:iconFileId",
      "/project/releases/platform-details",
      undefined,
    ],
  ])("opens %s from the panel at %s", async (rowId, path, expectedPayload) => {
    const deps = createDeps({ payload: { p: "project-1", s: "scene-9" } });
    await handleAfterMount(deps);

    handlePanelRowClick(deps, createRowEvent(rowId));

    expect(deps.appService.navigate).toHaveBeenCalledTimes(1);
    const [calledPath, calledPayload] = deps.appService.navigate.mock.calls[0];
    expect(calledPath).toBe(path);
    expect(calledPayload.p).toBe("project-1");
    if (expectedPayload) {
      expect(calledPayload).toEqual(expectedPayload);
    }
  });

  it("names the animation and the particle in the payload their editors read", async () => {
    const deps = createDeps({ payload: { p: "project-1" } });
    await handleAfterMount(deps);

    handlePanelRowClick(deps, createRowEvent("animation:animation-1"));
    handlePanelRowClick(deps, createRowEvent("particle:particle-1"));

    const payloads = deps.appService.navigate.mock.calls.map(
      ([, payload]) => payload,
    );
    expect(Object.values(payloads[0])).toContain("animation-1");
    expect(Object.values(payloads[1])).toContain("particle-1");
  });

  it("opens a panel row with Enter and ignores a row that is gone", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);

    handlePanelRowKeyDown(deps, {
      _event: {
        key: "Enter",
        preventDefault: vi.fn(),
        currentTarget: { dataset: { rowId: "layout:layout-1" } },
      },
    });
    handlePanelRowClick(deps, createRowEvent("layout:deleted"));

    expect(deps.appService.navigate).toHaveBeenCalledTimes(1);
  });

  it("shows a scene's lines when its row is clicked, and opens a line when that is clicked", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);
    await handleShowAllClick(deps);

    handleDialogRowClick(deps, createRowEvent("scene:scene-1"));

    expect(deps.context.state.expandedRowIds).toEqual(["scene:scene-1"]);
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    expect(deps.context.state.isDialogOpen).toBe(true);

    handleDialogRowClick(deps, createRowEvent("line:scene-1:1"));

    expect(deps.context.state.isDialogOpen).toBe(false);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/scene-editor",
      {
        p: "project-1",
        s: "scene-1",
        sectionId: "section-2",
        entryLineId: "line-9",
      },
    );
  });

  it("moves through the full list with the arrow keys", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);
    await handleShowAllClick(deps);
    const press = (key) => {
      const event = createKeyEvent(key);
      handleDialogListKeyDown(deps, event);
      return event;
    };

    // Up at the first row stays there.
    press("ArrowUp");
    expect(deps.context.state.activeRowId).toBe("scene:scene-1");

    // Right shows the scene's lines, and Right again steps into them.
    expect(press("ArrowRight")._event.preventDefault).toHaveBeenCalled();
    expect(deps.context.state.expandedRowIds).toEqual(["scene:scene-1"]);
    press("ArrowRight");
    expect(deps.context.state.activeRowId).toBe("line:scene-1:0");
    press("ArrowDown");
    expect(deps.context.state.activeRowId).toBe("line:scene-1:1");

    // Left on a line goes back to its scene, and Left again hides the lines.
    press("ArrowLeft");
    expect(deps.context.state.activeRowId).toBe("scene:scene-1");
    press("ArrowLeft");
    expect(deps.context.state.expandedRowIds).toEqual([]);

    press("ArrowDown");
    press("ArrowDown");
    expect(deps.context.state.activeRowId).toBe("layout:layout-1");

    // Enter opens the layout.
    press("Enter");
    expect(deps.context.state.isDialogOpen).toBe(false);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/layout-editor",
      expect.objectContaining({ l: "layout-1" }),
    );
  });

  it("stops at the last row and leaves other keys alone", async () => {
    const deps = createDeps({
      usages: [{ type: "layout", id: "layout-1", name: "Layout One" }],
    });
    await handleAfterMount(deps);
    await handleShowAllClick(deps);

    handleDialogListKeyDown(deps, createKeyEvent("ArrowDown"));
    expect(deps.context.state.activeRowId).toBe("layout:layout-1");

    const tab = createKeyEvent("Tab");
    handleDialogListKeyDown(deps, tab);
    expect(tab._event.preventDefault).not.toHaveBeenCalled();
  });

  it("closes the full list", async () => {
    const deps = createDeps();
    await handleAfterMount(deps);
    await handleShowAllClick(deps);

    handleDialogClose(deps);

    expect(deps.context.state.isDialogOpen).toBe(false);
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  describe("when the delete of a used image is blocked", () => {
    const createBlockedDeps = (options = {}) =>
      createDeps({ ...options, props: { mode: "blocked-delete" } });

    it("tells the page when the dialog closes", async () => {
      const deps = createBlockedDeps();
      await handleAfterMount(deps);

      handleDialogClose(deps);

      expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
    });

    it("closes and opens the place a row names", async () => {
      const deps = createBlockedDeps();
      await handleAfterMount(deps);

      handleDialogRowClick(deps, createRowEvent("control:control-1"));

      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
      expect(deps.appService.navigate).toHaveBeenCalledWith(
        "/project/layout-editor",
        expect.objectContaining({ c: "control-1" }),
      );
    });

    it("closes when nothing uses the image any more", async () => {
      const deps = createBlockedDeps({ usages: [] });

      await handleAfterMount(deps);

      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
    });

    it("closes with a toast when the usage cannot be loaded", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const deps = createBlockedDeps();
      deps.projectService.getImageUsage.mockRejectedValue(
        new Error("no scene"),
      );

      await handleAfterMount(deps);
      consoleError.mockRestore();

      expect(deps.appService.showToast).toHaveBeenCalledWith({
        message: "Couldn't load where this image is used.",
      });
      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
    });
  });

  describe("a folder that cannot be deleted", () => {
    const USED_IMAGES = [
      { id: "image-1", name: "Image One", usages: USAGES.slice(0, 3) },
      { id: "image-2", name: "Image Two", usages: USAGES.slice(2, 3) },
    ];
    const createFolderDeps = (options = {}) =>
      createDeps({
        usedImages: USED_IMAGES,
        ...options,
        props: {
          mode: "blocked-folder-delete",
          imageId: undefined,
          imageName: undefined,
          folderId: "folder-1",
          folderName: "Folder One",
        },
      });

    it("loads the used images of the folder when it mounts", async () => {
      const deps = createFolderDeps();

      await handleAfterMount(deps);

      expect(deps.projectService.getImageFolderUsage).toHaveBeenCalledWith({
        folderId: "folder-1",
      });
      expect(deps.projectService.getImageUsage).not.toHaveBeenCalled();
      expect(deps.context.state).toMatchObject({
        subjectId: "folder-1",
        status: "ready",
        usages: [],
        usedImages: USED_IMAGES,
      });
      expect(deps.dispatchEvent).not.toHaveBeenCalled();
    });

    it("asks to close when no image in the folder is used any more", async () => {
      const deps = createFolderDeps({ usedImages: [] });

      await handleAfterMount(deps);

      expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
    });

    it("reports a failed load and asks to close", async () => {
      const deps = createFolderDeps();
      deps.projectService.getImageFolderUsage.mockRejectedValue(
        new Error("read failed"),
      );
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await handleAfterMount(deps);

      expect(deps.appService.showToast).toHaveBeenCalledWith({
        message: "Couldn't load where this image is used.",
      });
      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
      consoleError.mockRestore();
    });

    it("expands a scene under the image it was clicked in", async () => {
      const deps = createFolderDeps();
      await handleAfterMount(deps);

      handleDialogRowClick(deps, createRowEvent("image:image-1:scene:scene-1"));

      expect(deps.context.state.expandedRowIds).toEqual([
        "image:image-1:scene:scene-1",
      ]);
      expect(deps.appService.navigate).not.toHaveBeenCalled();
    });

    it("asks to close and opens the place when a row is chosen", async () => {
      const deps = createFolderDeps();
      await handleAfterMount(deps);

      handleDialogRowClick(
        deps,
        createRowEvent("image:image-2:layout:layout-1"),
      );

      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
      expect(deps.appService.navigate).toHaveBeenCalledTimes(1);
      expect(deps.appService.navigate.mock.calls[0][0]).toBe(
        "/project/layout-editor",
      );
    });

    it("asks to close when the dialog closes", async () => {
      const deps = createFolderDeps();
      await handleAfterMount(deps);

      handleDialogClose(deps);

      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
    });

    it("loads again when another folder is shown", async () => {
      const deps = createFolderDeps();
      await handleAfterMount(deps);
      deps.props.folderId = "folder-2";

      await handleOnUpdate(deps, {
        oldProps: { mode: "blocked-folder-delete", folderId: "folder-1" },
        newProps: { mode: "blocked-folder-delete", folderId: "folder-2" },
      });

      expect(deps.projectService.getImageFolderUsage).toHaveBeenLastCalledWith({
        folderId: "folder-2",
      });
      expect(deps.context.state.subjectId).toBe("folder-2");
    });
  });
});
