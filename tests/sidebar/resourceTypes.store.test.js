import { describe, expect, it } from "vitest";
import {
  createInitialState as createMobileSidebarInitialState,
  setAssetPackageEnabled as setMobileAssetPackageEnabled,
  selectItemById,
  selectViewData as selectMobileSidebarViewData,
} from "../../src/components/mobileSidebar/mobileSidebar.store.js";
import {
  createInitialState as createDesktopResourceTypesInitialState,
  setAssetPackageEnabled as setDesktopAssetPackageEnabled,
  selectResourceItem,
  selectViewData as selectDesktopResourceTypesViewData,
} from "../../src/pages/resourceTypes/resourceTypes.store.js";
import { selectViewData as selectMobileResourceTypesViewData } from "../../src/components/imagesMobileResourceTypes/imagesMobileResourceTypes.store.js";
import { JA_I18N } from "../support/i18n.js";

describe("resource type navigation", () => {
  it("shows audio effects directly below animations in the action sheet", () => {
    const props = {
      resourceCategory: "animatedAssets",
      selectedResourceId: "audio-effects-editor",
    };

    const desktopViewData = selectDesktopResourceTypesViewData({ props });
    const mobileViewData = selectMobileResourceTypesViewData({ props });
    expect(desktopViewData.items.map((item) => item.id)).toEqual([
      "animations",
      "audioEffects",
      "particles",
      "spritesheets",
    ]);
    expect(mobileViewData.items.map((item) => item.id)).toEqual([
      "animations",
      "audioEffects",
      "particles",
      "spritesheets",
    ]);

    const mobileSidebarViewData = selectMobileSidebarViewData({
      state: createMobileSidebarInitialState(),
      props: { variant: "assets" },
    });
    const animatedSection = mobileSidebarViewData.sections.find(
      (section) => section.id === "animated-assets",
    );
    expect(animatedSection.items.map((item) => item.id)).toEqual([
      "animations",
      "audioEffects",
      "particles",
      "spritesheets",
    ]);
  });

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

  it("shows settings pages in desktop and mobile resource menus", () => {
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
      "config",
    ]);
    expect(
      mobileSidebarViewData.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["project", "about", "config"]);
    expect(
      mobileSidebarViewData.sections
        .flatMap((section) => section.items)
        .find((item) => item.id === "config"),
    ).toMatchObject({ icon: "settings" });
  });

  it("localizes the asset package item in the mobile release menu", () => {
    const state = createMobileSidebarInitialState();
    setMobileAssetPackageEnabled({ state }, { enabled: true });
    const mobileSidebarViewData = selectMobileSidebarViewData({
      state,
      props: { variant: "release" },
      i18n: JA_I18N,
    });
    const assetPackageItem = mobileSidebarViewData.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "assetPackage");

    expect(assetPackageItem.label).toBe("アセットパッケージ");
  });

  it.each([false, true])(
    "shows Asset Package in both Release menus only when enabled=%s",
    (enabled) => {
      const desktopState = createDesktopResourceTypesInitialState();
      const mobileState = createMobileSidebarInitialState();
      setDesktopAssetPackageEnabled({ state: desktopState }, { enabled });
      setMobileAssetPackageEnabled({ state: mobileState }, { enabled });
      const desktopViewData = selectDesktopResourceTypesViewData({
        state: desktopState,
        props: {
          resourceCategory: "releases",
          selectedResourceId: "platformDetails",
        },
      });
      const mobileSidebarViewData = selectMobileSidebarViewData({
        state: mobileState,
        props: {
          variant: "release",
        },
      });

      const desktopIds = ["versions", "platformDetails", "webServer"];
      const mobileIds = ["versions", "platformDetails"];
      if (enabled) {
        desktopIds.push("assetPackage");
        mobileIds.push("assetPackage");
      }
      expect(desktopViewData.items.map((item) => item.id)).toEqual(desktopIds);
      expect(
        mobileSidebarViewData.sections.flatMap((section) =>
          section.items.map((item) => item.id),
        ),
      ).toEqual(mobileIds);
      expect(
        Boolean(
          selectResourceItem(
            { state: desktopState, props: { resourceCategory: "releases" } },
            "assetPackage",
          ),
        ),
      ).toBe(enabled);
      expect(
        Boolean(
          selectItemById({ state: mobileState }, { itemId: "assetPackage" }),
        ),
      ).toBe(enabled);
    },
  );
});
