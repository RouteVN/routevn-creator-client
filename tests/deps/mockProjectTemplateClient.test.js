import { describe, expect, it } from "vitest";
import { createMockProjectTemplateClient } from "../../src/deps/clients/mockProjectTemplateClient.js";

const client = createMockProjectTemplateClient({ delayMs: 0 });

describe("mock project template client", () => {
  it("lists template cards a page at a time", async () => {
    const first = await client.listProjectTemplates();
    expect(first.templates).toHaveLength(6);
    expect(first.nextCursor).toBe("6");

    const second = await client.listProjectTemplates({
      cursor: first.nextCursor,
    });
    expect(second.templates.map(({ id }) => id)).toEqual([
      "template-kinetic-novel",
    ]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("gives each card what the gallery shows, without its details", async () => {
    const {
      templates: [card],
    } = await client.listProjectTemplates();
    expect(card).toMatchObject({
      id: "template-classic-romance",
      title: "Classic Romance",
      resolution: { width: 1920, height: 1080 },
      languages: ["en", "ja"],
      creator: { id: "creator-one", name: "Studio One" },
    });
    expect(card.summary).not.toBe("");
    expect(card.coverUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(card.creator.avatarUrl).toMatch(/^data:image\/svg\+xml/);
    expect(card.releasedAt).toEqual(expect.any(Number));
    expect(card).not.toHaveProperty("screenshots");
    expect(card).not.toHaveProperty("description");
  });

  it("reads a template with its screenshots and description", async () => {
    const template = await client.getProjectTemplateById({
      templateId: "template-night-mystery",
    });
    expect(template.screenshots.map(({ alt }) => alt)).toEqual([
      "Title screen",
      "Dialogue",
      "Choices",
      "Save and load",
    ]);
    for (const screenshot of template.screenshots) {
      expect(screenshot).toMatchObject({ width: 1920, height: 1080 });
      expect(decodeURIComponent(screenshot.url)).toContain("<svg");
    }
    // The cover is the title screen.
    expect(template.coverUrl).toBe(template.screenshots[0].url);
    expect(template.description[0]).toEqual({
      text: expect.stringContaining("detective story"),
    });
    expect(template.versionName).toBe("2.0.1");
    expect(template.updatedAt).toBeGreaterThanOrEqual(template.releasedAt);
  });

  it("fails for a template that is not listed", async () => {
    await expect(
      client.getProjectTemplateById({ templateId: "missing" }),
    ).rejects.toMatchObject({ code: "project_template_not_found" });
  });
});
