import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setSelectedItemId,
  setUiConfig,
  setVersions,
} from "../../src/pages/versions/versions.store.js";

const version = {
  id: "version-1",
  name: "Version 1",
  notes: "First release",
  actionIndex: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("versions store mobile view data", () => {
  it("shows the selected version in a mobile detail sheet in touch mode", () => {
    const state = createInitialState();

    setVersions({ state }, { versions: [version] });
    setSelectedItemId({ state }, { itemId: "version-1" });
    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
          inputMode: "touch",
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.showExplorerPanel).toBe(false);
    expect(viewData.showDetailPanel).toBe(false);
    expect(viewData.showMobileDetailSheet).toBe(true);
    expect(viewData.contentLeftPadding).toBe("0");
    expect(viewData.selectedItemName).toBe("Version 1");
    expect(viewData.mobileDetailFields).toEqual(viewData.detailFields);
    expect(
      viewData.mobileDetailFields.some((field) => field.slot === "actions"),
    ).toBe(true);
  });

  it("keeps the desktop detail panel outside touch mode", () => {
    const state = createInitialState();

    setVersions({ state }, { versions: [version] });
    setSelectedItemId({ state }, { itemId: "version-1" });

    const viewData = selectViewData({ state });

    expect(viewData.showExplorerPanel).toBe(true);
    expect(viewData.showDetailPanel).toBe(true);
    expect(viewData.showMobileDetailSheet).toBe(false);
    expect(viewData.contentLeftPadding).toBe("sm");
  });
});
