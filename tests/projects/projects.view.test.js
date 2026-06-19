import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("projects view", () => {
  it("keeps the app version visible outside the scrollable project list", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    const scrollContainerIndex = projectsView.indexOf(
      'rtgl-view w=f h=1fg ah=c sv style="min-height: 0;"',
    );
    const footerContainerIndex = projectsView.indexOf(
      'rtgl-view w=f ah=c bgc=bg style="flex-shrink: 0; padding-bottom: env(safe-area-inset-bottom);"',
    );
    const footerTextIndex = projectsView.indexOf(
      "rtgl-text s=xs c=mu-fg: RouteVN Creator ${appVersion}",
    );

    expect(scrollContainerIndex).toBeGreaterThan(-1);
    expect(footerContainerIndex).toBeGreaterThan(scrollContainerIndex);
    expect(projectsView).toContain("rtgl-view sm-w=f w=640 ph=lg pv=lg ah=c");
    expect(projectsView).toContain("$if platform != 'web'");
    expect(projectsView).toContain("rtgl-view#appVersionButton");
    expect(projectsView).toContain(
      "rtgl-dropdown-menu#appVersionDropdownMenu ?open=${appVersionMenu.isOpen} x=${appVersionMenu.x} y=${appVersionMenu.y} place=t :items=${appVersionMenu.items}",
    );
    expect(projectsView).toContain("handler: handleAppVersionClick");
    expect(projectsView).toContain("handler: handleAppVersionMenuClickItem");
    expect(footerTextIndex).toBeGreaterThan(footerContainerIndex);
    expect(projectsView).not.toContain("rtgl-view w=f ah=c pb=lg");
  });
});
