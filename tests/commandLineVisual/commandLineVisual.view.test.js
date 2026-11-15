import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import * as handlers from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";

const readView = () =>
  readFileSync(
    new URL(
      "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
      import.meta.url,
    ),
    "utf8",
  );

describe("commandLineVisual view", () => {
  it("outlines the visual rows, which change only their border on hover", () => {
    const rowLines = readView()
      .split("\n")
      .filter((line) => line.includes("rtgl-view#visualItem"));

    expect(rowLines).toHaveLength(1);
    expect(rowLines[0]).toContain("p=sm bw=xs bc=bo h-bc=ac br=md cur=pointer");
    expect(rowLines[0]).not.toContain("h-bgc=");
    expect(rowLines[0]).not.toContain("bgc=");
  });

  it("shows the visual in the edit view without a resource picker behind it", () => {
    const view = readView();

    expect(view).toContain(
      "'rtgl-view bw=xs bc=bo br=md overflow=hidden style=\"width: 200px;",
    );
    expect(view).not.toContain("visualImage");
    expect(view).not.toContain("resource-select");
    expect(view).not.toContain("rtgl-button#buttonSelect");
  });

  it("gives every button in the panel a click handler that exists", () => {
    const view = readView();
    const { refs } = yaml.load(view);
    const buttonIds = [...view.matchAll(/rtgl-button#(\w+)/g)].map(
      ([, id]) => id,
    );
    const refFor = (id) =>
      refs[id] ??
      Object.entries(refs).find(
        ([key]) => key.endsWith("*") && id.startsWith(key.slice(0, -1)),
      )?.[1];

    expect(buttonIds).toEqual(
      expect.arrayContaining(["submitButton", "addVisualButton"]),
    );
    for (const id of buttonIds) {
      const handler = refFor(id)?.eventListeners?.click?.handler;
      expect(handler, id).toBeTruthy();
      expect(typeof handlers[handler], `${id}: ${handler}`).toBe("function");
    }
  });

  it("uses the same accessible transform summary card as Background", () => {
    const view = readView();

    expect(view).toContain("customTransformButton*:");
    expect(view).toContain("handler: handleCustomTransformButtonClick");
    expect(view).toContain("handler: handleCustomTransformButtonKeyDown");
    expect(view).toContain(
      'rtgl-view#customTransformButton${visual.controlId} slot=${visual.customTransformFormSlot} data-index=${visual.visualIndex} data-target-name="${visual.displayName}" role=button tabindex=0 aria-label="${transformEditorTitle}"',
    );
    expect(view).toContain("rtgl-grid cols=2 g=md w=f:");
    expect(view).toContain("$for item, j in visual.customTransformDetails:");
    expect(view).not.toContain("backgroundTransformEditor");
  });
});
