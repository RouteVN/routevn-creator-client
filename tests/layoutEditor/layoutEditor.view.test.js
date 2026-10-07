import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layoutEditor.view", () => {
  it("opts into file explorer background deselection", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorView).toContain("selection-cleared:");
    expect(layoutEditorView).toContain("handler: handleFileExplorerItemClick");
  });

  it("keeps the mobile preview mounted while node detail is visible", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const previewPanelStart = layoutEditorView.indexOf(
      "previewPanelVisibilityStyle",
    );
    const mobileDetailStart = layoutEditorView.indexOf(
      "$if showMobileSelectedNodeDetail",
      previewPanelStart,
    );
    const detailPanelStart = layoutEditorView.indexOf(
      "$if showRightPanel",
      mobileDetailStart,
    );
    const mobileCenterBranch = layoutEditorView.slice(
      previewPanelStart,
      detailPanelStart,
    );
    const previewToDetailBoundary = layoutEditorView.slice(
      mobileDetailStart,
      detailPanelStart,
    );

    expect(previewPanelStart).toBeLessThan(mobileDetailStart);
    expect(previewToDetailBoundary).not.toContain(
      "rvn-layout-editor-preview#layoutEditorPreview",
    );
    expect(mobileCenterBranch).toContain("previewPanelVisibilityStyle");
    expect(mobileCenterBranch).toContain(
      ":initialPreviewData=${previewHydrationData}",
    );
    expect(mobileCenterBranch).toContain(
      "rvn-layout-editor-preview#layoutEditorPreview",
    );
  });

  it("shows the node explorer inline below the canvas instead of a full-page overlay", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const canvasStart = layoutEditorView.indexOf(
      "rvn-layout-editor-canvas#layoutEditorCanvas",
    );
    const explorerStart = layoutEditorView.indexOf(
      "$if showMobileNodeExplorer",
    );
    const detailStart = layoutEditorView.indexOf(
      "$if showMobileSelectedNodeDetail",
    );
    const explorerBranch = layoutEditorView.slice(explorerStart, detailStart);

    expect(canvasStart).toBeGreaterThan(-1);
    expect(explorerStart).toBeGreaterThan(canvasStart);
    expect(layoutEditorView.match(/\$if showMobileNodeExplorer/g)).toHaveLength(
      1,
    );
    expect(explorerBranch).toContain("${nodeExplorerTitle}");
    expect(explorerBranch).toContain("rvn-base-file-explorer#fileExplorer");
    expect(explorerBranch).toContain("show-item-menu-actions");
    expect(layoutEditorView).toContain("v=${nodeButtonVariant}");
    expect(layoutEditorView).not.toContain("mobileFileExplorerClose");
    expect(layoutEditorView).not.toContain("pos=fix");
  });

  it("puts the navbar's back button before the selected node name and opens the explorer", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const navbarBackButton = layoutEditorView
      .split("\n")
      .find((line) => line.includes("rtgl-button#backButton"));
    const detailStart = layoutEditorView.indexOf(
      "$if showMobileSelectedNodeDetail",
    );
    const detailHeader = layoutEditorView.slice(
      detailStart,
      layoutEditorView.indexOf(
        "rvn-layout-edit-panel#layoutEditPanel",
        detailStart,
      ),
    );
    const detailBackButton = detailHeader
      .split("\n")
      .find((line) => line.includes("rtgl-button#nodeDetailBackButton"));

    expect(navbarBackButton).toContain("sq pre=chevronLeft v=ol mr=sm");
    expect(detailBackButton).toContain("sq pre=chevronLeft v=ol mr=sm");
    expect(detailHeader.indexOf("nodeDetailBackButton")).toBeLessThan(
      detailHeader.indexOf("${item.name}"),
    );
    expect(layoutEditorView).toMatch(
      /nodeDetailBackButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleNodeDetailBackClick/,
    );
  });

  it("puts square up and down step buttons on the right of the Elements title", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const explorerStart = layoutEditorView.indexOf(
      "$if showMobileNodeExplorer",
    );
    const explorerBranch = layoutEditorView.slice(
      explorerStart,
      layoutEditorView.indexOf(
        "rvn-base-file-explorer#fileExplorer",
        explorerStart,
      ),
    );
    const titleIndex = explorerBranch.indexOf("${nodeExplorerTitle}");
    const upIndex = explorerBranch.indexOf(
      "rtgl-button#nodeMovePreviousButton",
    );
    const downIndex = explorerBranch.indexOf("rtgl-button#nodeMoveNextButton");

    expect(titleIndex).toBeGreaterThan(-1);
    expect(upIndex).toBeGreaterThan(titleIndex);
    expect(downIndex).toBeGreaterThan(upIndex);
    // Both reuse the chevron icon; the previous one turns it upside down.
    expect(explorerBranch).toMatch(
      /'rtgl-view style="transform: rotate\(180deg\);"':\n\s+- rtgl-svg svg=chevronDown wh=18: null/,
    );
    expect(explorerBranch).toContain("sq pre=chevronDown");
    // The icon registry is generated from svg/, so the source must exist.
    expect(
      existsSync(new URL("../../svg/chevronDown.svg", import.meta.url)),
    ).toBe(true);
    expect(explorerBranch).toContain('aria-label="${nodeMovePreviousLabel}"');
    expect(explorerBranch).toContain('aria-label="${nodeMoveNextLabel}"');
    expect(layoutEditorView).toMatch(
      /nodeMovePreviousButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleNodeMovePreviousClick/,
    );
    expect(layoutEditorView).toMatch(
      /nodeMoveNextButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleNodeMoveNextClick/,
    );
  });

  it("renders a persistent Elements pane to the left of the canvas on tablet landscape", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const paneStart = layoutEditorView.indexOf(
      "$if showTabletLandscapeExplorer",
    );
    const centerStart = layoutEditorView.indexOf(
      "rtgl-view h=48 bwb=xs bc=bo d=h av=c w=f ph=md",
    );
    const pane = layoutEditorView.slice(paneStart, centerStart);
    const explorerLine = pane
      .split("\n")
      .find((line) => line.includes("rvn-base-file-explorer#fileExplorer"));

    expect(
      layoutEditorView.match(/\$if showTabletLandscapeExplorer/g),
    ).toHaveLength(1);
    expect(paneStart).toBeGreaterThan(-1);
    expect(paneStart).toBeLessThan(centerStart);
    expect(pane).toContain("w=${tabletLandscapeExplorerWidth}");
    expect(pane).toContain("${nodeExplorerTitle}");
    expect(pane).not.toContain("rtgl-button#nodeMovePreviousButton");
    expect(pane).not.toContain("rtgl-button#nodeMoveNextButton");
    expect(explorerLine).toContain("show-item-menu-actions");
    expect(explorerLine).toContain(
      ":emptyContextMenuItems=${emptyContextMenuItems}",
    );
  });

  it("offers undo and redo in the canvas header on every layout", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const header = layoutEditorView.slice(
      layoutEditorView.indexOf("rtgl-button#backButton"),
      layoutEditorView.indexOf("$if showCanvasZoomControls"),
    );

    expect(header).toContain(
      'rtgl-button#undoButton sq pre=undo v=ol ?disabled=${undoDisabled} aria-label="${undoLabel}" title="${undoLabel}"',
    );
    expect(header).toContain(
      'rtgl-button#redoButton sq pre=redo v=ol ?disabled=${redoDisabled} aria-label="${redoLabel}" title="${redoLabel}"',
    );
    expect(layoutEditorView).toMatch(
      /undoButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleUndoButtonClick/,
    );
    expect(layoutEditorView).toMatch(
      /redoButton:\n\s+eventListeners:\n\s+click:\n\s+handler: handleRedoButtonClick/,
    );
  });

  it("puts the edit panel and the preview in a right panel with Edit and Preview tabs", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const rightStart = layoutEditorView.indexOf("$if showRightPanel");
    const mobileStart = layoutEditorView.indexOf("$if showMobilePanels");
    const rightPanel = layoutEditorView.slice(rightStart);
    const previewIndex = rightPanel.indexOf(
      "rvn-layout-editor-preview#layoutEditorPreview",
    );
    const editIndex = rightPanel.indexOf(
      "rvn-layout-edit-panel#layoutEditPanel",
    );

    expect(mobileStart).toBeGreaterThan(-1);
    expect(rightStart).toBeGreaterThan(mobileStart);
    expect(layoutEditorView.match(/\$if showRightPanel:/g)).toHaveLength(1);
    expect(rightPanel).toContain(
      "rvn-resizable-panel#resizableDetailPanel panel-type=detail-panel show-on-touch",
    );
    expect(rightPanel).toContain(
      "rtgl-tabs#rightPanelModeTabs s=sm selected-tab=${rightPanelMode} :items=${rightPanelModeTabs}",
    );
    // Both bodies stay mounted and are shown or hidden by style, so unsaved
    // preview settings and scroll positions survive switching modes.
    expect(rightPanel).toContain("${rightPanelEditStyle}");
    expect(rightPanel).toContain("${rightPanelPreviewStyle}");
    expect(editIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(editIndex);
    // The edit panel scrolls clear of the floating controls.
    const editSpacerIndex = rightPanel.indexOf(
      `'rtgl-view w=f h=240 aria-hidden=true style="flex: 0 0 240px;"': null`,
    );
    expect(editSpacerIndex).toBeGreaterThan(editIndex);
    expect(editSpacerIndex).toBeLessThan(previewIndex);
    expect(rightPanel).toContain("$if showRightPanelSaveButton");
    // The save button is an icon, named for screen readers and on hover.
    expect(rightPanel).toContain(
      'rtgl-button#saveButton sq pre=save v=se ml=sm aria-label="${savePreviewButton}" title="${savePreviewButton}"',
    );
    expect(layoutEditorView).toMatch(
      /rightPanelModeTabs:\n\s+eventListeners:\n\s+item-click:\n\s+handler: handleRightPanelModeChange/,
    );
  });

  it("centers the canvas vertically in its workspace", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const backgroundLine = layoutEditorView
      .split("\n")
      .find((line) =>
        line.includes("rvn-zoom-viewport#layoutEditorCanvasBackground"),
      );

    expect(backgroundLine).toContain("${canvasBackgroundStyle}");
    expect(backgroundLine).toContain("zoom=${canvasZoom}");
    expect(backgroundLine).toContain("?gestures=${showCanvasZoomControls}");
    expect(layoutEditorView).toContain("${canvasWorkspaceStyle}");
  });

  it("draws the preview header divider above and below", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorView).toContain(
      "h=48 w=f d=h bgc=bg bwt=xs bwb=xs ph=md av=c",
    );
  });

  it("draws vertical borders around the canvas", () => {
    const layoutEditorCanvasView = readFileSync(
      new URL(
        "../../src/components/layoutEditorCanvas/layoutEditorCanvas.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorCanvasView).toContain("bwl=xs bwr=xs bc=bo");
    expect(layoutEditorCanvasView).not.toContain("bwb=xs");
  });

  it("marks the empty canvas workspace with a theme-aware dot grid", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorView).toContain(
      "background-image: radial-gradient(circle, var(--input) 1px, transparent 1px)",
    );
    expect(layoutEditorView).toContain("background-size: 24px 24px");
  });

  it("renders only allowlisted semantic labels in selected-item headers", () => {
    const layoutEditorView = readFileSync(
      new URL(
        "../../src/pages/layoutEditor/layoutEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(layoutEditorView).not.toContain(
      "rtgl-text s=xs c=mu-fg: ${item.type}",
    );
    expect(layoutEditorView.match(/\$if itemRoleLabel:/g)).toHaveLength(2);
    expect(layoutEditorView.match(/\$\{itemRoleLabel\}/g)).toHaveLength(2);
  });
});
