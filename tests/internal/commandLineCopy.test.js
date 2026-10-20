import { describe, expect, it } from "vitest";
import {
  formatCommandLineActionCount,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../src/internal/ui/sceneEditor/commandLineCopy.js";
import { getRuntimeFieldItems } from "../../src/internal/runtimeFields.js";
import {
  EN_I18N,
  ES_I18N,
  FR_I18N,
  JA_I18N,
  PT_I18N,
  RU_I18N,
  TH_I18N,
  ZH_HANS_I18N,
} from "../support/i18n.js";

const LOCALE_I18N = {
  en: EN_I18N,
  ja: JA_I18N,
  "zh-hans": ZH_HANS_I18N,
  es: ES_I18N,
  th: TH_I18N,
  ru: RU_I18N,
  pt: PT_I18N,
  fr: FR_I18N,
};

describe("command-line action counts", () => {
  it("picks the singular or plural English template", () => {
    const copy = selectCommandLineCopy(EN_I18N);

    expect(formatCommandLineActionCount(1, copy)).toBe("1 action");
    expect(formatCommandLineActionCount(3, copy)).toBe("3 actions");
  });

  it("lets the catalog place the count", () => {
    const copy = selectCommandLineCopy(RU_I18N);

    expect(formatCommandLineActionCount(1, copy)).toBe("Действий: 1");
    expect(formatCommandLineActionCount(21, copy)).toBe("Действий: 21");
  });

  it("follows the catalog's plural rules for 0", () => {
    const formatZero = (i18n) =>
      formatCommandLineActionCount(
        0,
        selectCommandLineCopy(i18n),
        i18n.dateTime,
      );

    expect(formatZero(EN_I18N)).toBe("0 actions");
    expect(formatZero(FR_I18N)).toBe(
      FR_I18N.commandLinePage["{count} action"].replace("{count}", "0"),
    );
    expect(formatZero(PT_I18N)).toBe(
      PT_I18N.commandLinePage["{count} actions"].replace("{count}", "0"),
    );
  });
});

describe("command-line form layout", () => {
  it("stacks form rows at the large breakpoint by default", () => {
    const form = localizeCommandLineForm({
      fields: [
        {
          type: "row",
          fields: [
            { name: "first", type: "input-text" },
            { name: "second", type: "input-text" },
          ],
        },
        {
          type: "row",
          stackAt: "sm",
          fields: [
            { name: "third", type: "input-text" },
            { name: "fourth", type: "input-text" },
          ],
        },
      ],
    });

    expect(form.rowStackAt).toBe("lg");
    expect(form.fields[1].stackAt).toBe("sm");
  });
});

describe("runtime field descriptions", () => {
  it.each(Object.keys(LOCALE_I18N))(
    "translates every runtime field description in %s",
    (locale) => {
      const copy = selectCommandLineCopy(LOCALE_I18N[locale]);
      const englishCopy = selectCommandLineCopy(EN_I18N);

      for (const field of Object.values(getRuntimeFieldItems())) {
        const description = localizeCommandLineText(field.description, copy);
        expect(description).toEqual(expect.any(String));
        expect(localizeCommandLineText(field.description, englishCopy)).toBe(
          field.description,
        );
        if (locale !== "en") {
          expect(description).not.toBe(field.description);
        }
      }
    },
  );

  it("shows a translated description in the runtime action form", () => {
    const form = localizeCommandLineForm(
      {
        fields: [
          {
            name: "value",
            type: "input-number",
            description: "Controls the default dialogue text reveal speed.",
          },
        ],
      },
      selectCommandLineCopy(PT_I18N),
    );

    expect(form.fields[0].description).toBe(
      "Define a velocidade predefinida com que o texto do diálogo aparece.",
    );
  });
});

describe("visual resource type labels", () => {
  it.each(["Image", "Video", "Spritesheet", "Layout"])(
    "translates %s",
    (label) => {
      const copy = selectCommandLineCopy(JA_I18N);

      expect(localizeCommandLineText(label, copy)).not.toBe(label);
    },
  );
});
