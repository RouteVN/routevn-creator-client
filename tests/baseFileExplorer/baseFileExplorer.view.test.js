import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const readView = () =>
  readFileSync(
    new URL(
      "../../src/components/baseFileExplorer/baseFileExplorer.view.yaml",
      import.meta.url,
    ),
    "utf8",
  );

describe("baseFileExplorer view", () => {
  it("has valid YAML", () => {
    expect(() => yaml.load(readView())).not.toThrow();
  });

  it("keeps bottom empty space after the item list without intercepting clicks", () => {
    const view = readView();

    expect(view).toContain("div#container");
    expect(view).toContain("height: ${bottomEmptySpaceHeight};");
    expect(view).toContain("flex: 0 0 ${bottomEmptySpaceHeight};");
    expect(view).toContain("pointer-events: none;");
    expect(view).not.toContain("padding-bottom: ${bottomEmptySpaceHeight};");
    expect(view).not.toContain("rtgl-view w=f h=f:");
    expect(view).not.toContain("rtgl-view#container w=f h=1fg");
  });

  it("wires touchstart for mobile long-press drag", () => {
    const view = readView();

    expect(view).toContain("pointerdown:");
    expect(view).toContain("handler: handleItemPointerDown");
    expect(view).toContain("touchstart:");
    expect(view).toContain("handler: handleItemTouchStart");
    expect(view).toContain("touch-action: ${item.touchAction};");
    expect(view).toContain("data-file-explorer-arrow=true");
  });
});
