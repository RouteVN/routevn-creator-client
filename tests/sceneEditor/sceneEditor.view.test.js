import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import * as sceneEditorHandlers from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";

describe("sceneEditorLexical view", () => {
  it("renders the project-language text count in the editor toolbar", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      'rtgl-text#sceneTextStats s=xs c=mu-fg style="white-space: nowrap;"',
    );
    expect(view).toContain("${sceneTextStatsLabel}");
  });

  it("offers undo and redo in the text panel header, keeping the editor focused", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const template = view.slice(view.indexOf("template:"));

    expect(template).toContain(
      'rtgl-button#undoButton sq pre=undo v=ol ?disabled=${undoDisabled} aria-label="${undoLabel}" title="${undoLabel}"',
    );
    expect(template).toContain(
      'rtgl-button#redoButton sq pre=redo v=ol ?disabled=${redoDisabled} aria-label="${redoLabel}" title="${redoLabel}"',
    );
    expect(template.indexOf("${scene.name}")).toBeLessThan(
      template.indexOf("#undoButton"),
    );
    expect(template.indexOf("#redoButton")).toBeLessThan(
      template.indexOf("rtgl-button#sectionsOverview"),
    );
    for (const [ref, handler] of [
      ["undoButton", "handleUndoButtonClick"],
      ["redoButton", "handleRedoButtonClick"],
    ]) {
      expect(view).toMatch(
        new RegExp(
          `${ref}:\\n\\s+eventListeners:\\n\\s+mousedown:\\n\\s+handler: handleEditHistoryButtonMouseDown\\n\\s+click:\\n\\s+handler: ${handler}`,
        ),
      );
    }
  });

  it("gives the phone toolbar the undo and redo state", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rvn-mobile-keyboard-toolbar#mobileKeyboardToolbar width=${mobileToolbarWidth} :undoDisabled=${undoDisabled} :redoDisabled=${redoDisabled}",
    );
  });

  it("renders a matching canvas download button after preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const previewButtonIndex = view.indexOf("rtgl-button#previewButton");
    const downloadButtonIndex = view.indexOf(
      "rtgl-button#downloadCanvasButton",
    );

    expect(downloadButtonIndex).toBeGreaterThan(previewButtonIndex);
    expect(view).toContain(
      "rtgl-button#downloadCanvasButton sq pre=download v=ol",
    );
    expect(view).toContain("handler: handleDownloadCanvasClick");
  });

  it("shows a notice in place of the canvas, without preview or download, when graphics cannot start", () => {
    const source = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const findBranches = (node, key, found = []) => {
      if (Array.isArray(node)) {
        node.forEach((item) => findBranches(item, key, found));
      } else if (node && typeof node === "object") {
        if (key in node) {
          found.push(node);
        }
        Object.values(node).forEach((value) => findBranches(value, key, found));
      }
      return found;
    };
    const { template } = yaml.load(source);

    // Phone and desktop.
    const canvasBranches = findBranches(template, "$if isCanvasUnavailable");
    expect(canvasBranches).toHaveLength(2);
    for (const branch of canvasBranches) {
      const notice = JSON.stringify(branch["$if isCanvasUnavailable"]);
      expect(notice).toContain("rtgl-view#canvasUnavailableNotice");
      expect(notice).toContain("${canvasUnavailableMessage}");
      expect(notice).not.toContain("previewCanvasHost");
      expect(JSON.stringify(branch.$else)).toContain(
        "rvn-scene-editor-preview-canvas#previewCanvasHost",
      );
    }
    const [controls] = findBranches(template, "$if !isCanvasUnavailable");
    expect(JSON.stringify(controls)).toContain("rtgl-button#previewButton");
    expect(JSON.stringify(controls)).toContain(
      "rtgl-button#downloadCanvasButton",
    );
    expect(source).toContain(":previewHidden=${isCanvasUnavailable}");
  });

  it("renders the mobile preview canvas without wrapper padding", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain('rtgl-view w=f style="min-width: 0;"');
    expect(view).not.toContain('rtgl-view w=f p=sm style="min-width: 0;"');
    expect(view).toContain("scroll-padding-bottom: 48px");
  });

  it("uses the larger ellipsis icon for section menus", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const icon = readFileSync(
      new URL("../../svg/ellipsisLarge.svg", import.meta.url),
      "utf8",
    );

    expect(view.match(/pre=ellipsisLarge/g)).toHaveLength(2);
    expect(view).not.toContain("pre=ellipsis: null");
    expect(icon.match(/r="2\.4"/g)).toHaveLength(3);
  });

  it("bounds the mobile actions dialog below the preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("dialog-variant=scene-editor-mobile");
    expect(view).toContain(
      'dialog-panel-top="${mobileSystemActionsDialogTop}"',
    );
    expect(view).toContain(
      'dialog-panel-bottom="${mobileSystemActionsDialogBottom}"',
    );
  });

  it("listens for the transform editor's change, preview, canvas resize and drag cancel events from the system actions", () => {
    const view = yaml.load(
      readFileSync(
        new URL(
          "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const { eventListeners } = view.refs.systemActions;

    expect(eventListeners).toMatchObject({
      "background-transform-editor-change": {
        handler: "handleBackgroundTransformEditorChange",
      },
      "background-transform-editor-preview": {
        handler: "handleBackgroundTransformEditorPreview",
      },
      "background-transform-editor-preview-cancel": {
        handler: "handleBackgroundTransformEditorPreviewCancel",
      },
      "background-transform-editor-canvas-resize": {
        handler: "handleBackgroundTransformEditorCanvasResize",
      },
      "background-transform-editor-drag-cancel": {
        handler: "handleBackgroundTransformEditorDragCancel",
      },
    });
    for (const { handler } of Object.values(eventListeners)) {
      expect(sceneEditorHandlers[handler]).toBeTypeOf("function");
    }
  });

  it("opens the section menu from empty space in the sections scroller", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("sceneEditorSectionsScroll:");
    expect(view).toContain("handler: handleSectionsEmptySpaceContextMenu");
  });
});
