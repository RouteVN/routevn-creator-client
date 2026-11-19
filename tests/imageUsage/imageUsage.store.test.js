import { describe, expect, it } from "vitest";
import {
  closeDialog,
  createInitialState,
  failUsageLoad,
  finishUsageLoad,
  openDialog,
  selectActiveRowId,
  selectDialogRow,
  selectDialogRows,
  selectPanelRow,
  selectViewData,
  setActiveRowId,
  setRowExpanded,
  startUsageLoad,
} from "../../src/components/imageUsage/imageUsage.store.js";
import { EN_I18N, PL_I18N } from "../support/i18n.js";

const createLine = (lineNumber, overrides = {}) => ({
  sectionId: "section-1",
  sectionName: "Section One",
  lineId: `line-${lineNumber}`,
  lineNumber,
  actionType: "background",
  ...overrides,
});

const createSceneUsage = (id, name, lines) => ({
  type: "scene",
  id,
  name,
  lines,
});

const USAGES = [
  createSceneUsage("scene-1", "Scene One", [
    createLine(2),
    createLine(5, { actionType: "visual" }),
  ]),
  createSceneUsage("scene-2", "Scene Two", [createLine(1)]),
  { type: "layout", id: "layout-1", name: "Layout One" },
  { type: "control", id: "control-1", name: "Control One" },
  { type: "animation", id: "animation-1", name: "Animation One" },
  { type: "particle", id: "particle-1", name: "Particle One", isShown: true },
  { type: "platformDetails", platform: "android", property: "iconFileId" },
];

const createLoadedContext = (usages = USAGES) => {
  const context = { state: createInitialState() };
  startUsageLoad(context, { subjectId: "image-1" });
  finishUsageLoad(context, { subjectId: "image-1", usages });
  return context;
};

const selectView = (context, props = {}, i18n = EN_I18N) =>
  selectViewData({
    state: context.state,
    props: { imageId: "image-1", imageName: "Image One", ...props },
    i18n,
  });

describe("imageUsage.store", () => {
  it("shows that the usage is loading until it arrives", () => {
    const context = { state: createInitialState() };
    startUsageLoad(context, { subjectId: "image-1" });

    expect(selectView(context)).toMatchObject({
      showPanel: true,
      isLoading: true,
      headerLabel: "Used in",
      loadingLabel: "Loading...",
      isDialogOpen: false,
    });
  });

  it("lists each place once in the panel, with a scene's line count", () => {
    const view = selectView(createLoadedContext());

    expect(view).toMatchObject({
      isLoading: false,
      headerLabel: "Used in - 7",
      showAllVisible: false,
    });
    expect(
      view.panelRows.map(({ name, meta, icon, title }) => ({
        name,
        meta,
        icon,
        title,
      })),
    ).toEqual([
      { name: "Scene One", meta: "2 lines", icon: "scene", title: "Scenes" },
      { name: "Scene Two", meta: "1 line", icon: "scene", title: "Scenes" },
      { name: "Layout One", meta: "", icon: "layout", title: "Layouts" },
      { name: "Control One", meta: "", icon: "control", title: "Controls" },
      {
        name: "Animation One",
        meta: "",
        icon: "animation",
        title: "Animations",
      },
      {
        name: "Particle One",
        meta: "",
        icon: "particles",
        title: "Particles",
      },
      {
        name: "Android - Icon",
        meta: "",
        icon: "rocket",
        title: "Platform Details",
      },
    ]);
  });

  it("says an image nothing uses is not used anywhere", () => {
    const view = selectView(createLoadedContext([]));

    expect(view).toMatchObject({
      isEmpty: true,
      headerLabel: "Used in",
      notUsedLabel: "Not used anywhere",
      panelRows: [],
    });
  });

  it("lists ten places in the panel and offers the rest in the dialog", () => {
    const usages = Array.from({ length: 12 }, (_, index) => ({
      type: "layout",
      id: `layout-${index}`,
      name: `Layout ${index}`,
    }));
    const view = selectView(createLoadedContext(usages));

    expect(view.panelRows).toHaveLength(10);
    expect(view.showAllVisible).toBe(true);
    expect(view.showAllLabel).toBe("Show all (12)");
    expect(view.headerLabel).toBe("Used in - 12");
  });

  it("groups the full list by kind and keeps scenes collapsed", () => {
    const context = createLoadedContext();
    openDialog(context);
    const view = selectView(context);

    expect(view.isDialogOpen).toBe(true);
    expect(view.dialogTitle).toBe('Where "Image One" is used');
    expect(view.dialogMessage).toBe("");
    expect(
      view.dialogRows.map((row) =>
        row.kind === "group" ? row.label : `${row.kind}:${row.name}`,
      ),
    ).toEqual([
      "Scenes - 2",
      "scene:Scene One",
      "scene:Scene Two",
      "Layouts - 1",
      "item:Layout One",
      "Controls - 1",
      "item:Control One",
      "Animations - 1",
      "item:Animation One",
      "Particles - 1",
      "item:Particle One",
      "Platform Details - 1",
      "item:Android - Icon",
    ]);
    expect(view.dialogRows[1]).toMatchObject({
      dialogIcon: "chevronRight",
      ariaExpanded: "false",
      meta: "2 lines",
    });
    // No row is marked until an arrow key moves onto one.
    expect(
      view.dialogRows.filter((row) => row.isActive).map((row) => row.rowId),
    ).toEqual([]);
  });

  it("lists a scene's lines under it once it is expanded", () => {
    const context = createLoadedContext();
    openDialog(context);
    setRowExpanded(context, { rowId: "scene:scene-1", expanded: true });
    const view = selectView(context);

    expect(view.dialogRows[1]).toMatchObject({
      dialogIcon: "chevronDown",
      ariaExpanded: "true",
    });
    expect(
      view.dialogRows.slice(2, 4).map(({ kind, name }) => ({ kind, name })),
    ).toEqual([
      { kind: "line", name: "Section One - Line 2 - Background" },
      { kind: "line", name: "Section One - Line 5 - Visual" },
    ]);

    setRowExpanded(context, { rowId: "scene:scene-1", expanded: false });
    expect(selectView(context).dialogRows[2].name).toBe("Scene Two");
  });

  it("names a line without the action when the action has no name, and by its section when it has no number", () => {
    const context = createLoadedContext([
      createSceneUsage("scene-1", "Scene One", [
        createLine(3, { actionType: "somethingNew" }),
        createLine(4, { lineNumber: undefined }),
      ]),
    ]);
    openDialog(context);

    expect(
      selectView(context)
        .dialogRows.filter((row) => row.kind === "line")
        .map((row) => row.name),
    ).toEqual(["Section One - Line 3", "Section One"]);
  });

  it("shows the lines at once when a single scene uses the image", () => {
    const context = createLoadedContext([
      createSceneUsage("scene-1", "Scene One", [createLine(2)]),
      { type: "layout", id: "layout-1", name: "Layout One" },
    ]);

    expect(selectDialogRows(context).map((row) => row.kind)).toEqual([
      "scene",
      "line",
      "item",
    ]);
  });

  it("opens the first line of a scene from the panel, and each place from the dialog", () => {
    const context = createLoadedContext();
    setRowExpanded(context, { rowId: "scene:scene-1", expanded: true });

    expect(selectPanelRow(context, { rowId: "scene:scene-1" }).target).toEqual({
      type: "scene",
      sceneId: "scene-1",
      sectionId: "section-1",
      lineId: "line-2",
    });
    expect(
      selectDialogRow(context, { rowId: "line:scene-1:1" }).target,
    ).toEqual({
      type: "scene",
      sceneId: "scene-1",
      sectionId: "section-1",
      lineId: "line-5",
    });
    expect(
      selectDialogRow(context, { rowId: "control:control-1" }).target,
    ).toEqual({ type: "control", id: "control-1" });
    expect(
      selectDialogRow(context, {
        rowId: "platformDetails:android:iconFileId",
      }).target,
    ).toEqual({ type: "platformDetails" });
  });

  it("keeps the list and the expanded scenes while the same image loads again", () => {
    const context = createLoadedContext();
    openDialog(context);
    setRowExpanded(context, { rowId: "scene:scene-2", expanded: true });
    setActiveRowId(context, { rowId: "layout:layout-1" });

    startUsageLoad(context, { subjectId: "image-1" });
    expect(selectView(context).isLoading).toBe(false);
    expect(selectView(context).panelRows).toHaveLength(7);

    // Scene Two no longer uses the image.
    finishUsageLoad(context, {
      subjectId: "image-1",
      usages: USAGES.filter((usage) => usage.id !== "scene-2"),
    });

    expect(context.state.expandedRowIds).toEqual([]);
    expect(selectActiveRowId(context)).toBe("layout:layout-1");
    expect(selectView(context).headerLabel).toBe("Used in - 6");
  });

  it("marks no row once the active row's place stops using the image", () => {
    const context = createLoadedContext();
    openDialog(context);
    setActiveRowId(context, { rowId: "layout:layout-1" });

    finishUsageLoad(context, {
      subjectId: "image-1",
      usages: USAGES.filter((usage) => usage.id !== "layout-1"),
    });

    expect(selectActiveRowId(context)).toBeUndefined();
  });

  it("marks the row the arrow keys are on", () => {
    const context = createLoadedContext();
    openDialog(context);
    setActiveRowId(context, { rowId: "layout:layout-1" });

    expect(
      selectView(context)
        .dialogRows.filter((row) => row.isActive)
        .map((row) => row.rowId),
    ).toEqual(["layout:layout-1"]);

    // Opening the list again starts with no row marked.
    openDialog(context);

    expect(selectActiveRowId(context)).toBeUndefined();
  });

  it("starts over for another image and ignores a late answer for the previous one", () => {
    const context = createLoadedContext();

    startUsageLoad(context, { subjectId: "image-2" });
    expect(selectView(context).isLoading).toBe(true);

    finishUsageLoad(context, { subjectId: "image-1", usages: USAGES });
    failUsageLoad(context, { subjectId: "image-1" });
    expect(selectView(context).isLoading).toBe(true);

    finishUsageLoad(context, { subjectId: "image-2", usages: [] });
    expect(selectView(context).isEmpty).toBe(true);
  });

  it("shows a failed load in the panel and closes the full list", () => {
    const context = createLoadedContext();
    openDialog(context);

    failUsageLoad(context, { subjectId: "image-1" });

    expect(selectView(context)).toMatchObject({
      isFailed: true,
      loadFailedLabel: "Couldn't load where this image is used.",
      isDialogOpen: false,
    });
  });

  it("closes the full list", () => {
    const context = createLoadedContext();
    openDialog(context);
    closeDialog(context);

    expect(selectView(context).isDialogOpen).toBe(false);
  });

  describe("when the delete of a used image is blocked", () => {
    it("shows only the dialog, saying how many places use the image", () => {
      const view = selectView(createLoadedContext(), {
        mode: "blocked-delete",
      });

      expect(view).toMatchObject({
        showPanel: false,
        isDialogOpen: true,
        dialogTitle: 'Can\'t delete "Image One"',
        dialogMessage: "It is used in 7 places. Remove it from these first.",
      });
      expect(view.dialogRows[0].label).toBe("Scenes - 2");
    });

    it("words a single place in the singular", () => {
      const view = selectView(
        createLoadedContext([
          { type: "layout", id: "layout-1", name: "Layout One" },
        ]),
        { mode: "blocked-delete" },
      );

      expect(view.dialogMessage).toBe(
        "It is used in 1 place. Remove it from there first.",
      );
    });

    it("stays closed until the usage has loaded", () => {
      const context = { state: createInitialState() };
      startUsageLoad(context, { subjectId: "image-1" });

      expect(selectView(context, { mode: "blocked-delete" }).isDialogOpen).toBe(
        false,
      );
    });

    it("names the image by what it is when it has no name", () => {
      const context = createLoadedContext();
      openDialog(context);

      expect(
        selectView(context, { mode: "blocked-delete", imageName: "" })
          .dialogTitle,
      ).toBe("Can't delete this image");
      expect(selectView(context, { imageName: "" }).dialogTitle).toBe(
        "Where this image is used",
      );
    });
  });

  it("counts places and lines by the locale's plural rules", () => {
    const usages = [
      createSceneUsage(
        "scene-1",
        "Scene One",
        Array.from({ length: 5 }, (_, index) => createLine(index + 1)),
      ),
      { type: "layout", id: "layout-1", name: "Layout One" },
    ];
    const view = selectView(
      createLoadedContext(usages),
      { mode: "blocked-delete" },
      PL_I18N,
    );

    expect(view.dialogMessage).toBe(
      "Jest używany w 2 miejscach. Najpierw go stamtąd usuń.",
    );
    expect(view.dialogRows[1].meta).toBe("5 wierszy");
  });

  describe("a folder that cannot be deleted", () => {
    const USED_IMAGES = [
      {
        id: "image-1",
        name: "Image One",
        usages: [
          createSceneUsage("scene-1", "Scene One", [createLine(2)]),
          { type: "layout", id: "layout-1", name: "Layout One" },
        ],
      },
      {
        id: "image-2",
        name: "Image Two",
        usages: [
          createSceneUsage("scene-1", "Scene One", [createLine(7)]),
          { type: "platformDetails", platform: "web", property: "iconFileId" },
        ],
      },
    ];
    const FOLDER_PROPS = {
      mode: "blocked-folder-delete",
      imageId: undefined,
      imageName: undefined,
      folderId: "folder-1",
      folderName: "Folder One",
    };

    const createFolderContext = (usedImages = USED_IMAGES) => {
      const context = { state: createInitialState() };
      startUsageLoad(context, { subjectId: "folder-1" });
      finishUsageLoad(context, { subjectId: "folder-1", usedImages });
      return context;
    };

    it("names the folder and counts the images that are used", () => {
      const view = selectView(createFolderContext(), FOLDER_PROPS);

      expect(view).toMatchObject({
        showPanel: false,
        isDialogOpen: true,
        dialogTitle: 'Can\'t delete "Folder One"',
        dialogMessage:
          "2 images in this folder are used. Remove them from these places first.",
      });
    });

    it("counts a single used image in the singular", () => {
      const view = selectView(
        createFolderContext(USED_IMAGES.slice(0, 1)),
        FOLDER_PROPS,
      );

      expect(view.dialogMessage).toBe(
        "1 image in this folder is used. Remove it from these places first.",
      );
    });

    it("falls back to a title without a name", () => {
      const view = selectView(createFolderContext(), {
        ...FOLDER_PROPS,
        folderName: "",
      });

      expect(view.dialogTitle).toBe("Can't delete this folder");
    });

    it("lists each used image followed by where it is used", () => {
      const view = selectView(createFolderContext(), FOLDER_PROPS);

      expect(
        view.dialogRows.map((row) => [
          row.rowId,
          row.kind,
          row.label ?? row.name,
        ]),
      ).toEqual([
        ["group:image:image-1", "group", "Image One - 2"],
        ["image:image-1:scene:scene-1", "scene", "Scene One"],
        ["image:image-1:layout:layout-1", "item", "Layout One"],
        ["group:image:image-2", "group", "Image Two - 2"],
        ["image:image-2:scene:scene-1", "scene", "Scene One"],
        ["image:image-2:platformDetails:web:iconFileId", "item", "Web - Icon"],
      ]);
      expect(view.dialogRows[0].icon).toBe("image");
    });

    it("expands a scene under one image without expanding it under another", () => {
      const context = createFolderContext();

      setRowExpanded(context, {
        rowId: "image:image-2:scene:scene-1",
        expanded: true,
      });

      expect(selectDialogRows(context).map((row) => row.rowId)).toEqual([
        "image:image-1:scene:scene-1",
        "image:image-1:layout:layout-1",
        "image:image-2:scene:scene-1",
        "image:image-2:line:scene-1:0",
        "image:image-2:platformDetails:web:iconFileId",
      ]);
      expect(
        selectDialogRow(context, { rowId: "image:image-2:line:scene-1:0" }),
      ).toMatchObject({
        sceneRowId: "image:image-2:scene:scene-1",
        target: {
          type: "scene",
          sceneId: "scene-1",
          sectionId: "section-1",
          lineId: "line-7",
        },
      });
    });

    it("shows the lines at once when one scene is all there is", () => {
      const context = createFolderContext([
        {
          id: "image-1",
          name: "Image One",
          usages: [createSceneUsage("scene-1", "Scene One", [createLine(2)])],
        },
      ]);

      expect(context.state.expandedRowIds).toEqual([
        "image:image-1:scene:scene-1",
      ]);
      expect(selectActiveRowId(context)).toBeUndefined();
    });

    it("keeps the panel list empty", () => {
      const view = selectView(createFolderContext(), FOLDER_PROPS);

      expect(view.panelRows).toEqual([]);
      expect(view.showPanel).toBe(false);
    });
  });
});
