import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import { handleDialogFormAction } from "../../src/pages/spritesheets/spritesheets.handlers.js";

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
} = {}) => {
  const appService = {
    showAlert: vi.fn(),
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
});
