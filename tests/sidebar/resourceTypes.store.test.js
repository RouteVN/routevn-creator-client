import { describe, expect, it } from "vitest";
import {
  createInitialState as createMobileSidebarInitialState,
  selectViewData as selectMobileSidebarViewData,
} from "../../src/components/mobileSidebar/mobileSidebar.store.js";
import { selectViewData as selectDesktopResourceTypesViewData } from "../../src/pages/resourceTypes/resourceTypes.store.js";
import { selectViewData as selectMobileResourceTypesViewData } from "../../src/components/imagesMobileResourceTypes/imagesMobileResourceTypes.store.js";
import { JA_I18N } from "../support/i18n.js";

describe("resource type navigation", () => {
  it("shows variables in system resource menus", () => {
    const props = {
      resourceCategory: "systemConfig",
      selectedResourceId: "controls",
    };

    const desktopViewData = selectDesktopResourceTypesViewData({ props });
    const mobileViewData = selectMobileResourceTypesViewData({ props });

    expect(desktopViewData.items.map((item) => item.id)).toEqual([
      "variables",
      "controls",
    ]);
    expect(mobileViewData.items.map((item) => item.id)).toEqual([
      "variables",
      "controls",
    ]);
  });

  it("shows all settings pages in desktop and mobile resource menus", () => {
    const desktopViewData = selectDesktopResourceTypesViewData({
      props: {
        resourceCategory: "settings",
        selectedResourceId: "about",
      },
    });
    const mobileSidebarViewData = selectMobileSidebarViewData({
      state: createMobileSidebarInitialState(),
      props: {
        variant: "settings",
      },
    });

    expect(desktopViewData.items.map((item) => item.id)).toEqual([
      "about",
      "appearance",
      "language",
      "assetPackage",
    ]);
    expect(
      mobileSidebarViewData.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["project", "about", "appearance", "language", "assetPackage"]);
  });

  it("localizes the asset package item in the mobile settings menu", () => {
    const mobileSidebarViewData = selectMobileSidebarViewData({
      state: createMobileSidebarInitialState(),
      props: { variant: "settings" },
      i18n: JA_I18N,
    });
    const assetPackageItem = mobileSidebarViewData.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "assetPackage");

    expect(assetPackageItem.label).toBe("アセットパッケージ");
  });

  it("shows platform details in desktop and mobile release menus", () => {
    const desktopViewData = selectDesktopResourceTypesViewData({
      props: {
        resourceCategory: "releases",
        selectedResourceId: "platformDetails",
      },
    });
    const mobileSidebarViewData = selectMobileSidebarViewData({
      state: createMobileSidebarInitialState(),
      props: {
        variant: "release",
      },
    });

    expect(desktopViewData.items.map((item) => item.id)).toEqual([
      "versions",
      "platformDetails",
      "webServer",
    ]);
    expect(
      mobileSidebarViewData.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["versions", "platformDetails"]);
  });
});
