import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleDialogAtlasSourceClick,
  handleDialogFormAction,
  handleSpritesheetItemDoubleClick,
} from "../../src/pages/spritesheets/spritesheets.handlers.js";

const existingSpritesheet = {
  id: "spritesheet-1",
  type: "spritesheet",
  name: "Walk Cycle",
  fileId: "sheet-file",
  width: 128,
  height: 128,
  sheetWidth: 512,
  sheetHeight: 128,
  frameCount: 4,
  jsonData: {},
  animations: {},
};

const createDialogDeps = ({
  dialogMode,
  dialogItemId,
  existingItem,
  sourceFiles,
  createsEmpty = false,
  confirmReplace = true,
} = {}) => {
  const appService = {
    showAlert: vi.fn(),
    showDialog: vi.fn(async () => confirmReplace),
    getAppCopy: vi.fn(() => ({})),
    navigate: vi.fn(),
    getPayload: vi.fn(() => ({ p: "project-1" })),
  };
  const projectService = {
    validateImageUploadFiles: vi.fn(async (files) => ({
      files,
      rejected: [],
      limit: 4096,
    })),
    uploadFiles: vi.fn(async ([file]) => [
      {
        fileId: `${file.name}-file`,
        fileRecords: [],
        dimensions: {
          width: 512,
          height: 128,
        },
      },
    ]),
    createSpritesheet: vi.fn(async () => ({})),
    updateSpritesheet: vi.fn(async () => ({})),
    getRepositoryState: vi.fn(() => ({
      spritesheets: {
        items: {},
        tree: [],
      },
      files: {
        items: {},
        tree: [],
      },
    })),
  };
  const store = {
    selectIsDialogSubmitting: vi.fn(() => false),
    setDialogSubmitting: vi.fn(),
    selectDialogCreatesEmpty: vi.fn(() => createsEmpty),
    selectDialogMode: vi.fn(() => dialogMode),
    selectDialogItemId: vi.fn(() => dialogItemId),
    selectDialogParentId: vi.fn(() => undefined),
    selectDialogImportData: vi.fn(() => undefined),
    selectDialogDraftAnimations: vi.fn(() => ({})),
    selectDialogSourceFiles: vi.fn(() => sourceFiles),
    selectDialogPreviewUrl: vi.fn(() => undefined),
    selectItemById: vi.fn(() => existingItem),
    selectSelectedItemId: vi.fn(() => undefined),
    setSelectedItemId: vi.fn(),
    setItems: vi.fn(),
    setTagsData: vi.fn(),
    closeDialog: vi.fn(),
  };

  return {
    i18n: EN_I18N,
    appService,
    projectService,
    refs: {},
    render: vi.fn(),
    store,
  };
};

const submitDialog = (deps, values) =>
  handleDialogFormAction(deps, {
    _event: {
      detail: {
        actionId: "submit",
        values,
      },
    },
  });

describe("spritesheets dialog form action", () => {
  it("removes the default frame size when editing with empty size fields", async () => {
    const deps = createDialogDeps({
      dialogMode: "edit",
      dialogItemId: "spritesheet-1",
      existingItem: existingSpritesheet,
    });

    await submitDialog(deps, {
      name: "Walk Cycle",
      description: "",
      tagIds: [],
      width: "",
      height: "",
    });

    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.projectService.updateSpritesheet).toHaveBeenCalledTimes(1);
    const [{ spritesheetId, data }] =
      deps.projectService.updateSpritesheet.mock.calls[0];
    expect(spritesheetId).toBe("spritesheet-1");
    expect(data.width).toBeNull();
    expect(data.height).toBeNull();
    expect(data.fileId).toBe("sheet-file");
  });

  it("sends no null size when the edited spritesheet has no frame size", async () => {
    const unsizedSpritesheet = structuredClone(existingSpritesheet);
    delete unsizedSpritesheet.width;
    delete unsizedSpritesheet.height;
    const deps = createDialogDeps({
      dialogMode: "edit",
      dialogItemId: "spritesheet-1",
      existingItem: unsizedSpritesheet,
    });

    await submitDialog(deps, {
      name: "Walk Cycle",
      description: "",
      tagIds: [],
      width: "",
      height: "",
    });

    const [{ data }] = deps.projectService.updateSpritesheet.mock.calls[0];
    expect(data.width).toBeUndefined();
    expect(data.height).toBeUndefined();
  });

  it("does not send null sizes when creating with empty size fields", async () => {
    const deps = createDialogDeps({
      dialogMode: "create",
      sourceFiles: {
        pngFile: { name: "walk.png" },
        atlasFile: { name: "walk.json" },
      },
    });

    await submitDialog(deps, {
      name: "Walk Cycle",
      description: "",
      tagIds: [],
      width: "",
      height: "",
    });

    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(deps.projectService.createSpritesheet).toHaveBeenCalledTimes(1);
    const [{ data }] = deps.projectService.createSpritesheet.mock.calls[0];
    expect(data.type).toBe("spritesheet");
    expect(data.fileId).toBe("walk.png-file");
    expect(data.width).toBeUndefined();
    expect(data.height).toBeUndefined();
  });

  it("creates an empty spritesheet with no sheet file", async () => {
    const deps = createDialogDeps({
      dialogMode: "create",
      createsEmpty: true,
    });

    await submitDialog(deps, {
      name: " Blink ",
      description: "",
      tagIds: [],
      source: "empty",
    });

    expect(deps.projectService.uploadFiles).not.toHaveBeenCalled();
    const [{ data, fileRecords }] =
      deps.projectService.createSpritesheet.mock.calls[0];
    expect(data).toEqual({
      type: "spritesheet",
      name: "Blink",
      description: "",
      tagIds: [],
      jsonData: {},
      animations: {},
    });
    expect(fileRecords).toBeUndefined();
    expect(deps.store.closeDialog).toHaveBeenCalled();
  });

  it("sends no sheet or atlas when editing an empty spritesheet without a file", async () => {
    const emptySpritesheet = {
      id: "spritesheet-1",
      type: "spritesheet",
      name: "Blink",
      jsonData: {},
      animations: {},
    };
    const deps = createDialogDeps({
      dialogMode: "edit",
      dialogItemId: "spritesheet-1",
      existingItem: emptySpritesheet,
    });

    await submitDialog(deps, {
      name: "Blink 2",
      description: "",
      tagIds: [],
      width: "",
      height: "",
    });

    const [{ data }] = deps.projectService.updateSpritesheet.mock.calls[0];
    expect(data).not.toHaveProperty("fileId");
    expect(data).not.toHaveProperty("jsonData");
    expect(data.name).toBe("Blink 2");
  });

  describe("a spritesheet made in the editor", () => {
    const framedSpritesheet = {
      ...existingSpritesheet,
      frameSource: {
        frameWidth: 32,
        frameHeight: 32,
        frames: [{ fileId: "frame-a" }],
      },
    };
    const values = {
      name: "Walk Cycle",
      description: "",
      tagIds: [],
      width: "128",
      height: "128",
    };

    it("keeps the frames when no new file is chosen", async () => {
      const deps = createDialogDeps({
        dialogMode: "edit",
        dialogItemId: "spritesheet-1",
        existingItem: framedSpritesheet,
      });

      await submitDialog(deps, values);

      expect(deps.appService.showDialog).not.toHaveBeenCalled();
      const [{ data }] = deps.projectService.updateSpritesheet.mock.calls[0];
      expect(data.frameSource).toEqual(framedSpritesheet.frameSource);
    });

    it("asks first, then clears the frames when a new sheet replaces them", async () => {
      const deps = createDialogDeps({
        dialogMode: "edit",
        dialogItemId: "spritesheet-1",
        existingItem: framedSpritesheet,
        sourceFiles: { pngFile: { name: "walk.png" } },
      });

      await submitDialog(deps, values);

      expect(deps.appService.showDialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Replace the frames?" }),
      );
      const [{ data }] = deps.projectService.updateSpritesheet.mock.calls[0];
      expect(data.frameSource).toBeNull();
      expect(data.fileId).toBe("walk.png-file");
    });

    it("keeps a JSON for several images until its PNG files are chosen", async () => {
      const deps = createDialogDeps({
        dialogMode: "edit",
        dialogItemId: "spritesheet-1",
        existingItem: framedSpritesheet,
      });
      let sourceFiles = {};
      deps.store.selectDialogSourceFiles = vi.fn(() => sourceFiles);
      deps.store.selectDialogValues = vi.fn(() => values);
      deps.store.setDialogImport = vi.fn((payload) => {
        sourceFiles = payload.sourceFiles;
      });
      deps.refs = { dialogForm: { reset: vi.fn(), setValues: vi.fn() } };
      const atlas = {
        textures: [
          { image: "walk-0.png", frames: [] },
          { image: "walk-1.png", frames: [] },
        ],
      };
      deps.appService.pickFiles = vi.fn(
        async () =>
          new File([JSON.stringify(atlas)], "walk.json", {
            type: "application/json",
          }),
      );

      await handleDialogAtlasSourceClick(deps);

      const missingMessage =
        "Choose the PNG files this JSON uses: walk-0.png, walk-1.png.";
      expect(deps.appService.showAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: missingMessage }),
      );
      expect(sourceFiles).toMatchObject({
        atlasFile: { name: "walk.json" },
        missingImages: ["walk-0.png", "walk-1.png"],
      });

      // Saving now would drop the frames without a new sheet.
      deps.appService.showAlert.mockClear();
      await submitDialog(deps, values);

      expect(deps.appService.showAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: missingMessage }),
      );
      expect(deps.appService.showDialog).not.toHaveBeenCalled();
      expect(deps.projectService.updateSpritesheet).not.toHaveBeenCalled();
    });

    it("does not save when the replacement is declined", async () => {
      const deps = createDialogDeps({
        dialogMode: "edit",
        dialogItemId: "spritesheet-1",
        existingItem: framedSpritesheet,
        sourceFiles: { pngFile: { name: "walk.png" } },
        confirmReplace: false,
      });

      await submitDialog(deps, values);

      expect(deps.projectService.uploadFiles).not.toHaveBeenCalled();
      expect(deps.projectService.updateSpritesheet).not.toHaveBeenCalled();
    });
  });

  it("opens the spritesheet editor on double-click", () => {
    const deps = createDialogDeps({});

    handleSpritesheetItemDoubleClick(deps, {
      _event: { detail: { itemId: "spritesheet-1" } },
    });

    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/spritesheet-editor",
      { p: "project-1", ss: "spritesheet-1" },
    );
  });
});
