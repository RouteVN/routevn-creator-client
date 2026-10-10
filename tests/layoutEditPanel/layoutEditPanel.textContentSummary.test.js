import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutEditPanelView = readFileSync(
  new URL(
    "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("layoutEditPanel text content summary", () => {
  it("fills the panel's width and looks like rtgl-select", () => {
    const summaryBlock = layoutEditPanelView.slice(
      layoutEditPanelView.indexOf("$elif item.type == 'text-content-summary':"),
    );
    const [, itemLine, fieldLine] = summaryBlock.split("\n");

    expect(itemLine).toContain("rtgl-view#textContentItem${i}x${j}");
    expect(itemLine).toContain(" w=f ");
    expect(fieldLine).toContain(
      "rtgl-view.layoutEditorTextContentSummaryField",
    );
    for (const attribute of [
      " w=f ",
      " ph=md ",
      " bgc=su ",
      " bw=xs ",
      " bc=bo ",
    ]) {
      expect(fieldLine).toContain(attribute);
    }
  });

  it("gives action items rtgl-select's background", () => {
    const actionItemLine = layoutEditPanelView
      .slice(layoutEditPanelView.indexOf("$elif item.type == 'list-item':"))
      .split("\n")
      .find((line) => line.includes("rtgl-view#listItem"));

    expect(actionItemLine).toContain("rtgl-view#listItem${i}x${j}x${k}");
    expect(actionItemLine).toContain(" bgc=su ");
  });
});
