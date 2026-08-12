import { describe, expect, it } from "vitest";
import {
  createInitialState as createMobileSidebarInitialState,
  selectViewData as selectMobileSidebarViewData,
} from "../../src/components/mobileSidebar/mobileSidebar.store.js";
import { selectViewData as selectDesktopResourceTypesViewData } from "../../src/pages/resourceTypes/resourceTypes.store.js";
import { selectViewData as selectMobileResourceTypesViewData } from "../../src/components/imagesMobileResourceTypes/imagesMobileResourceTypes.store.js";

describe("resource type navigation", () => {
  it("shows audio effects in desktop and mobile animated asset menus", () => {
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

  it("shows appearance and language in settings resource menus", () => {
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
    ]);
    expect(
      mobileSidebarViewData.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["project", "about", "appearance", "language"]);
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
