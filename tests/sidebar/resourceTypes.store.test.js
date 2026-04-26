import { describe, expect, it } from "vitest";
import {
  createInitialState as createMobileSidebarInitialState,
  selectViewData as selectMobileSidebarViewData,
} from "../../src/components/mobileSidebar/mobileSidebar.store.js";
import { selectViewData as selectDesktopResourceTypesViewData } from "../../src/pages/resourceTypes/resourceTypes.store.js";
import { selectViewData as selectMobileResourceTypesViewData } from "../../src/components/imagesMobileResourceTypes/imagesMobileResourceTypes.store.js";

describe("resource type navigation", () => {
  it("hides variables from system resource menus", () => {
    const props = {
      resourceCategory: "systemConfig",
      selectedResourceId: "controls",
    };

    const desktopViewData = selectDesktopResourceTypesViewData({ props });
    const mobileViewData = selectMobileResourceTypesViewData({ props });

    expect(desktopViewData.items.map((item) => item.id)).toEqual(["controls"]);
    expect(mobileViewData.items.map((item) => item.id)).toEqual(["controls"]);
  });

  it("hides appearance from settings resource menus", () => {
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

    expect(desktopViewData.items.map((item) => item.id)).toEqual(["about"]);
    expect(
      mobileSidebarViewData.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      ),
    ).toEqual(["project", "about"]);
  });
});
