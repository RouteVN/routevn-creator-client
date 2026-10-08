import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutEditPanelView = readFileSync(
  new URL(
    "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

const getDialogSize = (dialogId) => {
  const line = layoutEditPanelView
    .split("\n")
    .find((candidate) => candidate.includes(`rtgl-dialog#${dialogId} `));
  return line?.match(/ s=(\w+):/)?.[1];
};

describe("layoutEditPanel dialog sizes", () => {
  it("opens the sound dialog as wide as the visibility dialog", () => {
    expect(getDialogSize("visibilityConditionDialog")).toBe("md");
    expect(getDialogSize("soundFormDialog")).toBe(
      getDialogSize("visibilityConditionDialog"),
    );
  });
});
