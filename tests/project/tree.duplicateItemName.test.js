import { describe, expect, it } from "vitest";
import { createDuplicateItemName } from "../../src/internal/project/tree.js";

const animations = {
  tree: [
    { id: "folder-1", children: [{ id: "fade" }, { id: "fade-2" }] },
    { id: "slide" },
    { id: "level-10" },
  ],
  items: {
    "folder-1": { id: "folder-1", type: "folder", name: "Fade 3" },
    fade: { id: "fade", type: "animation", name: "Fade" },
    "fade-2": { id: "fade-2", type: "animation", name: "Fade 2" },
    slide: { id: "slide", type: "animation", name: "Slide" },
    "level-10": { id: "level-10", type: "animation", name: "Level 10" },
  },
};

describe("createDuplicateItemName", () => {
  it("adds 2 to a name no copy uses yet", () => {
    expect(createDuplicateItemName(animations, "slide")).toBe("Slide 2");
  });

  it("takes the next number that no item of the same type uses", () => {
    expect(createDuplicateItemName(animations, "fade")).toBe("Fade 3");
  });

  it("counts on from the number a copied name already ends with", () => {
    expect(createDuplicateItemName(animations, "fade-2")).toBe("Fade 3");
    expect(createDuplicateItemName(animations, "level-10")).toBe("Level 11");
  });
});
