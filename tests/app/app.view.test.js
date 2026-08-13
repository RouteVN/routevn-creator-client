import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app view", () => {
  it("passes the committed route to the sidebar", () => {
    const appView = readFileSync(
      new URL("../../src/pages/app/app.view.yaml", import.meta.url),
      "utf8",
    );

    expect(appView).toContain("rvn-sidebar :currentRoute=${currentRoute}");
  });

  it("renders the language settings page for its project route", () => {
    const appView = readFileSync(
      new URL("../../src/pages/app/app.view.yaml", import.meta.url),
      "utf8",
    );

    expect(appView).toContain(
      '$elif currentRoutePattern == "/project/language"',
    );
    expect(appView).toContain("rvn-language");
  });

  it("renders the asset package settings page for its project route", () => {
    const appView = readFileSync(
      new URL("../../src/pages/app/app.view.yaml", import.meta.url),
      "utf8",
    );

    expect(appView).toContain(
      '$elif currentRoutePattern == "/project/asset-package"',
    );
    expect(appView).toContain("rvn-asset-package");
  });

  it("prevents mobile tab tap feedback from rendering over the sheet", () => {
    const appView = readFileSync(
      new URL("../../src/pages/app/app.view.yaml", import.meta.url),
      "utf8",
    );

    expect(appView).toContain("rvn-mobile-sheet#mobileSheet");
    expect(appView).toContain("position: relative; z-index: 1150;");
    expect(appView).toContain(
      "rtgl-view#mobileTabItem${i} data-tab-id=${item.id}",
    );
    expect(appView).toContain(
      "rtgl-svg wh=22 svg=${item.icon} c=${item.color}",
    );
    expect(appView).toContain("rtgl-text s=xs c=${item.color}");
    expect(appView).toContain("-webkit-tap-highlight-color: transparent;");
  });
});
