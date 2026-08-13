import { describe, expect, it } from "vitest";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "./support/i18n.js";

const APP_UPDATER_BUTTON_PATH = "appPage.updateNowButton";

const collectUpdateButtonLabels = (catalog, path = []) =>
  Object.entries(catalog).flatMap(([key, value]) => {
    const nextPath = [...path, key];
    if (value && typeof value === "object") {
      return collectUpdateButtonLabels(value, nextPath);
    }
    if (!/^update.*Button$/i.test(key)) {
      return [];
    }
    if (nextPath.join(".") === APP_UPDATER_BUTTON_PATH) {
      return [];
    }
    return [{ path: nextPath.join("."), value }];
  });

describe("update button labels", () => {
  it.each([
    ["English", EN_I18N, "Update"],
    ["Japanese", JA_I18N, "更新"],
    ["Simplified Chinese", ZH_HANS_I18N, "更新"],
  ])("uses a generic label in %s edit forms", (_locale, catalog, expected) => {
    const labels = collectUpdateButtonLabels(catalog);

    expect(labels.length).toBeGreaterThan(20);
    expect(labels.filter(({ value }) => value !== expected)).toEqual([]);
  });
});
