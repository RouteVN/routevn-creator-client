import { describe, expect, it } from "vitest";
// The package entry also loads the custom elements, which need a DOM; this
// module only holds the defaults.
import { DEFAULT_UI_MESSAGES } from "../node_modules/@rettangoli/ui/src/common/uiMessages.js";
import {
  EN_I18N,
  ES_I18N,
  FR_I18N,
  JA_I18N,
  PT_I18N,
  RU_I18N,
  TH_I18N,
  VI_I18N,
  ZH_HANS_I18N,
} from "./support/i18n.js";

const CATALOGS = [
  ["English", EN_I18N],
  ["Japanese", JA_I18N],
  ["Simplified Chinese", ZH_HANS_I18N],
  ["Spanish", ES_I18N],
  ["Thai", TH_I18N],
  ["Russian", RU_I18N],
  ["Portuguese", PT_I18N],
  ["French", FR_I18N],
  ["Vietnamese", VI_I18N],
];

const placeholders = (message) => (message.match(/\{\w+\}/g) ?? []).sort();

describe("rtglUi catalog namespace", () => {
  it("matches Rettangoli UI's English defaults", () => {
    expect(EN_I18N.rtglUi).toEqual({ ...DEFAULT_UI_MESSAGES });
  });

  it.each(CATALOGS)(
    "has every Rettangoli UI key with its placeholders in %s",
    (_language, catalog) => {
      expect(Object.keys(catalog.rtglUi).sort()).toEqual(
        Object.keys(DEFAULT_UI_MESSAGES).sort(),
      );
      for (const [key, message] of Object.entries(DEFAULT_UI_MESSAGES)) {
        expect(placeholders(catalog.rtglUi[key])).toEqual(
          placeholders(message),
        );
      }
    },
  );
});
