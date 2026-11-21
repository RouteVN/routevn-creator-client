import { describe, expect, it } from "vitest";
import { wouldRemoveAllSections } from "../../src/internal/sectionRemoval.js";

describe("wouldRemoveAllSections", () => {
  const sections = {
    items: { parent: {}, child: {}, other: {} },
    tree: [{ id: "parent", children: [{ id: "child" }] }, { id: "other" }],
  };

  it("counts descendants and multiple selected sections", () => {
    expect(wouldRemoveAllSections(sections, ["parent"])).toBe(false);
    expect(wouldRemoveAllSections(sections, ["parent", "other"])).toBe(true);
    expect(wouldRemoveAllSections(sections, ["child", "other"])).toBe(false);
    expect(
      wouldRemoveAllSections(
        { items: { parent: {}, child: {} }, tree: [sections.tree[0]] },
        ["parent"],
      ),
    ).toBe(true);
  });
});
