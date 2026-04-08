import { describe, expect, it } from "vitest";
import { createControlTemplate } from "../../src/pages/controls/controls.handlers.js";

describe("createControlTemplate", () => {
  const projectResolution = {
    width: 1920,
    height: 1080,
  };

  it("creates control elements with required ids and names", () => {
    const template = createControlTemplate(projectResolution);
    const itemEntries = Object.entries(template.items);

    expect(Array.isArray(template.tree)).toBe(true);
    expect(itemEntries.length).toBeGreaterThan(0);

    itemEntries.forEach(([itemId, item]) => {
      expect(item.id).toBe(itemId);
      expect(item.name).toBeTruthy();
    });
  });
});
