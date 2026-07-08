import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project page view", () => {
  it("uses the resource navbar icon style for back and project actions", () => {
    const projectView = readFileSync(
      new URL("../../src/pages/project/project.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectView).toContain(
      'rtgl-button#backButton sq pre=chevronLeft v=ol title="${i18n.projectPage.backToProjects}" aria-label="${i18n.projectPage.backToProjects}"',
    );
    expect(projectView).toContain("keydown:");
    expect(projectView).toContain("handler: handleBackButtonKeyDown");
    expect(projectView).toContain(
      "rtgl-text s=sm ml=xs: ${i18n.projectPage.backToProjects}",
    );
    expect(projectView).toContain(
      'rtgl-button#projectActionsButton sq pre=ellipsis v=ol title="${i18n.projectPage.exportProject}" aria-label="${i18n.projectPage.exportProject}"',
    );
    expect(projectView).not.toContain(
      "rtgl-button#backButton pre=chevronLeft v=gh",
    );
    expect(projectView).not.toContain(
      "rtgl-button#projectActionsButton sq v=gh pre=ellipsis",
    );
  });

  it("aligns the detail content with the navbar icon inset", () => {
    const projectView = readFileSync(
      new URL("../../src/pages/project/project.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectView).toContain("rtgl-view h=48 w=f bgc=bg bwb=xs ph=md");
    expect(projectView).toContain("rtgl-view w=f h=f pt=md:");
    expect(projectView).not.toContain("rtgl-view w=f h=f ph=lg pt=md:");
  });
});
