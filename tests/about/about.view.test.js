import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import {
  createInitialState,
  selectViewData,
} from "../../src/pages/about/about.store.js";
import { resolveUpdatesEnabled } from "../../src/internal/updates.js";
import { EN_I18N } from "../support/i18n.js";

const view = yaml.load(
  readFileSync(
    new URL("../../src/pages/about/about.view.yaml", import.meta.url),
    "utf8",
  ),
);

describe("About update capability", () => {
  it.each([
    { platform: "android", supported: true, visible: true },
    { platform: "android", supported: false, visible: false },
    { platform: "tauri", supported: true, visible: true },
    {
      platform: "tauri",
      supported: true,
      updatesEnabled: false,
      visible: false,
    },
    { platform: "web", supported: true, visible: false },
  ])(
    "renders update controls for $platform with support $supported and override $updatesEnabled",
    ({ platform, supported, updatesEnabled, visible }) => {
      const state = createInitialState();
      state.platform = platform;
      state.isTouchMode = platform === "android";
      state.updatesEnabled = resolveUpdatesEnabled({
        appService: { getPlatform: () => platform },
        updaterService: { isSupported: () => supported },
        updatesEnabled,
      });
      const template = JSON.stringify(
        parseAndRender(view.template, selectViewData({ state, i18n: EN_I18N })),
      );
      expect(template.includes("#checkUpdateButton")).toBe(visible);
    },
  );
});
