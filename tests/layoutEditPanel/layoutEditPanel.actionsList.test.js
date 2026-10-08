import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutEditPanelView = readFileSync(
  new URL(
    "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("layoutEditPanel actions list", () => {
  it("puts a gap between the action items", () => {
    const listBlock = layoutEditPanelView.slice(
      layoutEditPanelView.indexOf("$elif item.type == 'list-item':"),
      layoutEditPanelView.indexOf("$elif item.type == 'list-bar':"),
    );

    expect(listBlock).toContain(
      "- rtgl-view d=v w=f g=md:\n                          - $for listItem, k in item.items:",
    );
  });
});
