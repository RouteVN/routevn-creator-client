import { describe, expect, it } from "vitest";
import { wouldDeleteAllSections } from "../../src/internal/sectionDeletion.js";

describe("wouldDeleteAllSections", () => {
  const sections = {
    items: { parent: {}, child: {}, other: {} },
    tree: [{ id: "parent", children: [{ id: "child" }] }, { id: "other" }],
  };

  it("counts descendants and multiple selected sections", () => {
    expect(wouldDeleteAllSections(sections, ["parent"])).toBe(false);
    expect(wouldDeleteAllSections(sections, ["parent", "other"])).toBe(true);
    expect(wouldDeleteAllSections(sections, ["child", "other"])).toBe(false);
    expect(
      wouldDeleteAllSections(
        { items: { parent: {}, child: {} }, tree: [sections.tree[0]] },
        ["parent"],
      ),
    ).toBe(true);
  });
});
