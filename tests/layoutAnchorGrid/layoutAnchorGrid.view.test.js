import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const readView = () =>
  readFileSync(
    new URL(
      "../../src/components/layout-anchor-grid/layout-anchor-grid.view.yaml",
      import.meta.url,
    ),
    "utf8",
  );

describe("layoutAnchorGrid view", () => {
  it("renders an accessible three-by-three radio grid", () => {
    const view = readView();

    expect(() => yaml.load(view)).not.toThrow();
    expect(view).toContain('role=radiogroup aria-label="${label}"');
    expect(view).toContain('grid-template-columns: "repeat(3, 36px)"');
    expect(view).toContain("button#anchorCell${i}.layoutAnchorGridCell");
    expect(view).toContain("role=radio");
    expect(view).toContain('aria-checked="${cell.isSelected}"');
    expect(view).toContain("tabindex=${cell.tabIndex}");
    expect(view).toContain(".layoutAnchorGridCell[data-selected='true']");
  });
});
