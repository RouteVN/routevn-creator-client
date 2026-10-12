import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("scenes view", () => {
  it("keeps the scene workspace mounted but hidden until setup is ready", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(
      scenesView.match(/visibility: \$\{sceneWorkspaceVisibility\}/g),
    ).toHaveLength(2);
  });

  it("opts into file explorer background deselection", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(scenesView).toContain("selection-cleared:");
    expect(scenesView).toContain("handler: handleFileExplorerSelectionChanged");
  });

  it("uses a bordered top-right mobile hamburger opener", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(scenesView).toContain('style="right: 8px; top: 8px;"');
    expect(scenesView).toContain(
      'rtgl-button#mobileFileExplorerOpenButton sq pre=hamburger v=ol title="${title}" aria-label="${title}"',
    );
    expect(scenesView).toContain(
      "rtgl-button#mobileFileExplorerClose sq pre=x v=ol",
    );
    expect(scenesView).toContain(
      "padding-top: var(--rvn-mobile-overlay-top-inset, 0px)",
    );
  });

  it("uses a popover for desktop scene creation", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(scenesView).toContain(
      "rtgl-popover#sceneFormPopover ?open=${showSceneFormPopover} x=${sceneFormPosition.x} y=${sceneFormPosition.y}",
    );
  });

  it("uses image-style mobile dialogs with sticky scene form actions", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(scenesView).toContain(
      "rtgl-dialog#sceneFormDialog ?open=${showSceneFormDialog} s=md md-layout=fixed-top:",
    );
    expect(scenesView).toContain(
      "rtgl-dialog#editDialog ?open=${isEditDialogOpen} s=md md-layout=fixed-top:",
    );
    expect(
      scenesView.match(/slot=content d=v w=f h=f overflow=hidden:/g),
    ).toHaveLength(2);
    // Check the sticky layout attributes on each form's line, so other
    // attributes can be added to the form without breaking this test. The
    // desktop scene popover has its own, non-sticky `rtgl-form#sceneForm`, so
    // the lookup includes the dialog form's bindings.
    const lines = scenesView.split("\n");
    const sceneFormLine = lines.find((line) =>
      line.includes(
        "rtgl-form#sceneForm key=${sceneFormKey} :defaultValues=${sceneFormData} :form=${sceneFormFields} ",
      ),
    );
    const editFormLine = lines.find((line) =>
      line.includes(
        "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm} ",
      ),
    );
    expect(sceneFormLine).toContain(" sticky ");
    expect(sceneFormLine).toContain("bottom-spacer=96");
    expect(sceneFormLine).toContain("w=f h=f");
    expect(editFormLine).toContain(" sticky ");
    expect(editFormLine).toContain("bottom-spacer=96");
    expect(editFormLine).toContain("w=f h=f");
  });

  it("uses the same mobile file explorer navbar sizing as images", () => {
    const scenesView = readFileSync(
      new URL("../../src/pages/scenes/scenes.view.yaml", import.meta.url),
      "utf8",
    );

    expect(scenesView).toContain(
      "rtgl-view h=48 w=f d=h av=c ph=md bgc=bg bwb=xs g=md",
    );
    expect(scenesView).not.toContain("rtgl-view h=56 w=f d=h av=c");
  });
});
