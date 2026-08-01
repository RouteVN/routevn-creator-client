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

  it("keeps basic information and analytics in separate scrollable sections", () => {
    const projectView = readFileSync(
      new URL("../../src/pages/project/project.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectView).toContain("rtgl-view h=48 w=f bgc=bg bwb=xs ph=md");
    expect(projectView).toContain(
      'rtgl-view#projectPageScroll w=f h=1fg sv style="min-height: 0;"',
    );
    expect(projectView).not.toContain(
      "${i18n.projectPage.basicInformationTitle}",
    );
    expect(projectView).toContain(
      "rtgl-view#analyticsSection w=f d=v g=lg ph=md pt=lg bwt=xs bc=bo",
    );
    expect(projectView).toContain("rtgl-text s=h4: ${group.label}");
    expect(projectView).not.toContain(
      "${i18n.projectPage.resourceCountsTitle}",
    );
    expect(projectView).not.toContain("${i18n.resourceTypes.characters}");
    expect(projectView).toContain("$for group, groupIndex in resourceGroups");
    expect(projectView).toContain(
      "$if group.key == 'assets' && characterResources.length > 0:",
    );
    expect(projectView).not.toContain("${i18n.projectPage.noCharacters}");
    expect(projectView).toContain("rtgl-view w=f d=v g=sm mt=sm:");
    expect(projectView).toContain("$for character, i in characterResources");
    expect(projectView).toContain("$for scene, i in sceneTextStats");
    expect(projectView).toContain("${sceneTextCountLabel}");
    expect(projectView).toContain("resourceCount*:");
    expect(projectView).toContain("characterResourceRow*:");
    expect(projectView).toContain("sceneCountTotal:");
    expect(projectView).toContain("sceneTextTotal:");
    expect(projectView).toContain("sceneTextRow*:");
    expect(projectView).toContain("handler: handleAnalyticsLinkClick");
    expect(projectView).toContain("handler: handleAnalyticsLinkKeyDown");
    expect(projectView).toContain(
      "data-resource-key=${resource.key} role=link tabindex=0",
    );
    expect(projectView).toContain(
      "flex: 0 1 128px; min-width: 112px; max-width: 128px;",
    );
    expect(projectView).toContain(
      'rtgl-view#characterResourcesTable bw=xs bc=bo br=md style="width: min(100%, 672px); max-width: 672px; align-self: flex-start;"',
    );
    expect(projectView).toContain(
      'rtgl-view#sceneTextStatsTable bw=xs bc=bo br=md style="width: min(100%, 672px); max-width: 672px; align-self: flex-start;"',
    );
    expect(projectView).toContain("${i18n.projectPage.spritesLabel}");
    expect(projectView).toContain("${character.spriteCount}");
    expect(projectView).toContain(
      "rtgl-text s=sm c=mu-fg w=1fg: ${i18n.projectPage.spritesLabel}",
    );
    expect(projectView).not.toContain("${character.imageCount}");
    expect(projectView).not.toContain("${character.spritesheetCount}");
    expect(projectView).toContain(
      "#sceneCountTotal data-resource-key=scenes role=link tabindex=0 w=128",
    );
    expect(projectView).toContain(
      "#sceneTextTotal data-resource-key=scenes role=link tabindex=0 w=128",
    );
    expect(projectView).toContain(
      "data-character-id=${character.id} role=link tabindex=0",
    );
    expect(projectView).toContain(
      "data-resource-key=scenes role=link tabindex=0",
    );
    expect(projectView).toContain(
      "data-scene-id=${scene.id} role=link tabindex=0",
    );
    expect(projectView).toContain("${i18n.projectPage.scenesTitle}");
    expect(projectView).not.toContain("${i18n.projectPage.sceneTextTitle}");
    expect(projectView).toContain("${sceneCountLabel}");
    expect(projectView).toContain("${sceneCount}");
    expect(projectView).toContain("sceneTextStatsError");
    expect(projectView).toContain("sceneTextAnalyticsRetry:");
    expect(projectView).toContain("handler: handleSceneTextAnalyticsRetry");
    expect(projectView).toContain(
      "${i18n.projectPage.failedCalculateSceneTextAnalytics}",
    );
    expect(projectView).toContain(
      "${i18n.projectPage.retrySceneTextAnalytics}",
    );
    expect(projectView).not.toContain("sceneTextAnalyticsUnavailable");
    expect(projectView).toContain(
      "rtgl-text s=sm c=mu-fg w=1fg: ${sceneTextCountLabel}",
    );
    expect(projectView).toContain(
      'rtgl-text s=sm w=1fg style="font-variant-numeric: tabular-nums;"',
    );
    expect(projectView).not.toContain("${scene.wordCount}");
    expect(projectView).not.toContain("${scene.characterCount}");
  });

  it("opens the edit dialog when project language is clicked", () => {
    const projectView = readFileSync(
      new URL("../../src/pages/project/project.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectView).toContain("projectLanguage:");
    expect(projectView).toContain("handler: handleEditButtonClick");
    expect(projectView).toContain(
      "rtgl-view#projectLanguage slot=project-language cur=pointer",
    );
    expect(projectView).toContain("rtgl-text: ${projectLanguage}");
  });
});
