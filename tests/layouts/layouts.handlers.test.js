import { describe, expect, it } from "vitest";
import { createLayoutTemplate } from "../../src/pages/layouts/layouts.handlers.js";

describe("createLayoutTemplate", () => {
  const projectResolution = {
    width: 1920,
    height: 1080,
  };

  it("creates an NVL layout template without throwing", () => {
    const template = createLayoutTemplate("nvl", projectResolution);

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
  });

  it("creates a save-load layout template without throwing", () => {
    const template = createLayoutTemplate("save-load", projectResolution);

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
  });

  it("creates a confirm dialog layout template without throwing", () => {
    const template = createLayoutTemplate("confirmDialog", projectResolution);

    expect(template).toBeDefined();
    expect(Array.isArray(template.tree)).toBe(true);
    expect(Object.keys(template.items).length).toBeGreaterThan(0);
  });
});
