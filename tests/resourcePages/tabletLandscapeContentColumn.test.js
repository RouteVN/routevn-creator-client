import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TABLET_LANDSCAPE_CONTENT_WIDTH,
  buildTabletLandscapeContentColumnStyle,
} from "../../src/internal/ui/resourcePages/mobileResourcePage.js";
import { EN_I18N } from "../support/i18n.js";

const pages = ["about", "config", "tutorials", "project"];
const touch = { inputMode: "touch" };

const readView = (page) =>
  readFileSync(
    new URL(`../../src/pages/${page}/${page}.view.yaml`, import.meta.url),
    "utf8",
  );

const createStyleState = ({ isTouchMode, width, height }) => ({
  isTouchMode,
  appWindowMetrics: { width, height },
});

describe("tablet landscape content column", () => {
  it("matches the Projects page column width", () => {
    const projectsView = readFileSync(
      new URL("../../src/pages/projects/projects.view.yaml", import.meta.url),
      "utf8",
    );

    expect(projectsView).toContain(`w=${TABLET_LANDSCAPE_CONTENT_WIDTH} `);
  });

  it("centers the column with horizontal padding on touch landscape tablets", () => {
    const style = buildTabletLandscapeContentColumnStyle(
      createStyleState({ isTouchMode: true, width: 1408, height: 880 }),
      { minGutter: "var(--spacing-md)" },
    );
    const gutter = "max(var(--spacing-md), calc((100% - 640px) / 2))";

    expect(style).toBe(`padding-left: ${gutter}; padding-right: ${gutter};`);
  });

  it.each([
    ["tablet portrait", { isTouchMode: true, width: 800, height: 1280 }],
    ["phone portrait", { isTouchMode: true, width: 390, height: 844 }],
    ["desktop", { isTouchMode: false, width: 1920, height: 1080 }],
    ["metrics not received yet", { isTouchMode: true, width: 0, height: 0 }],
  ])("leaves the layout alone on %s", (_name, state) => {
    expect(
      buildTabletLandscapeContentColumnStyle(createStyleState(state)),
    ).toBe("");
  });

  it.each(pages)(
    "%s applies the column only on tablet landscape",
    async (page) => {
      const store = await import(`../../src/pages/${page}/${page}.store.js`);
      const state = store.createInitialState();
      store.setUiConfig({ state }, { uiConfig: touch });

      store.setAppWindowMetrics({ state }, { width: 1408, height: 880 });
      expect(
        store.selectViewData({ state, i18n: EN_I18N })
          .tabletLandscapeContentStyle,
      ).toContain("calc((100% - 640px) / 2)");

      store.setAppWindowMetrics({ state }, { width: 880, height: 1408 });
      expect(
        store.selectViewData({ state, i18n: EN_I18N })
          .tabletLandscapeContentStyle,
      ).toBe("");
    },
  );

  it.each(pages)("%s view applies the column to its scroll content", (page) => {
    expect(readView(page)).toContain("${tabletLandscapeContentStyle}");
  });

  it("keeps the About row and body full width so the column can center", () => {
    const view = readView("about");

    expect(view).toContain("rtgl-view d=h w=f h=f style=");
    expect(view).toContain("rtgl-view w=f g=xl mt=${contentBodyMarginTop}");
  });

  it.each(["about", "config", "tutorials", "project"])(
    "%s subscribes to window metrics and cleans up",
    (page) => {
      const handlers = readFileSync(
        new URL(`../../src/pages/${page}/${page}.handlers.js`, import.meta.url),
        "utf8",
      );

      expect(handlers).toContain("mountMobileResourceWindowLayout(deps)");
    },
  );
});
