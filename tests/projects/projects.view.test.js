import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("projects view", () => {
  it("uses the shared navbar style for the projects title and mobile create action", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain(
      "rtgl-view h=48 w=f bgc=bg bwb=xs ph=md av=c",
    );
    expect(projectsView).toContain("rtgl-text: ${localTitle}");
    expect(projectsView).toContain(
      'rtgl-button#mobileCreateMenuButton sq pre=plus v=ol title="${createButtonText}" aria-label="${createButtonText}"',
    );
    expect(projectsView).not.toContain("rtgl-text s=h3: ${localTitle}");
    expect(projectsView).not.toContain("pt=lg pb=md");
    expect(projectsView).not.toContain(
      'rtgl-button#mobileCreateMenuButton sq pre=plus v="gh"',
    );
  });

  it("keeps the app version visible outside the scrollable project list", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    const scrollContainerIndex = projectsView.indexOf(
      'rtgl-view w=f h=1fg ah=c sv style="min-height: 0;"',
    );
    const footerContainerIndex = projectsView.indexOf(
      'rtgl-view w=f ah=c bgc=bg style="flex-shrink: 0;"',
    );
    const footerTextIndex = projectsView.indexOf(
      "rtgl-text s=xs c=mu-fg: RouteVN Creator ${appVersion}",
    );

    expect(scrollContainerIndex).toBeGreaterThan(-1);
    expect(footerContainerIndex).toBeGreaterThan(scrollContainerIndex);
    expect(projectsView).toContain("rtgl-view sm-w=f w=640 ph=md pv=lg ah=c");
    expect(projectsView).toContain("$if platform != 'web'");
    expect(projectsView).toContain("rtgl-view#appVersionButton");
    expect(projectsView).toContain(
      "rtgl-dropdown-menu#appVersionDropdownMenu ?open=${appVersionMenu.isOpen} x=${appVersionMenu.x} y=${appVersionMenu.y} place=t :items=${appVersionMenu.items}",
    );
    expect(projectsView).toContain("handler: handleAppVersionClick");
    expect(projectsView).toContain("handler: handleAppVersionMenuClickItem");
    expect(projectsView).toContain("handler: handleLanguageDialogClose");
    expect(projectsView).toContain("handler: handleLanguageFormAction");
    expect(projectsView).toContain("rtgl-dialog#languageDialog");
    expect(projectsView).toContain("rtgl-form#languageForm");
    expect(footerTextIndex).toBeGreaterThan(footerContainerIndex);
    expect(projectsView).not.toContain("rtgl-view w=f ah=c pb=lg");
  });

  it("uses the standard navbar inset for header and list content", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain(
      'rtgl-view w=f d=v pl=md style="max-width: 1280px;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v ph=md style="max-width: 1280px;"',
    );
    expect(projectsView).not.toContain(
      'rtgl-view w=f d=v ph=lg style="max-width: 1280px;"',
    );
  });
});
