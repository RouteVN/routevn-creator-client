import { describe, expect, it } from "vitest";
import {
  buildSceneTextStats,
  formatSceneTextStatsLabel,
  getSceneTextForStats,
} from "../../src/internal/ui/sceneTextStats.js";
import { FR_I18N, RU_I18N } from "../support/i18n.js";

describe("sceneTextStats", () => {
  it("counts dialogue words and choice text", () => {
    const scene = {
      sections: [
        {
          name: "Section name should not count",
          lines: [
            {
              actions: {
                dialogue: {
                  content: [{ text: "Hello world 我喜欢视觉小说" }],
                },
                choice: {
                  items: [{ content: "Go home" }, { content: "留下" }],
                },
              },
            },
          ],
        },
      ],
    };

    expect(getSceneTextForStats(scene)).not.toContain("Section name");
    expect(buildSceneTextStats(scene)).toEqual({
      lineCount: 1,
      wordCount: 9,
      characterCount: 25,
    });
  });

  it("uses reference display text from dialogue content", () => {
    const scene = {
      sections: [
        {
          lines: [
            {
              actions: {
                dialogue: {
                  content: [
                    { text: "Hello " },
                    { reference: { resourceId: "playerName" } },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    expect(getSceneTextForStats(scene)).toBe("Hello playerName");
    expect(buildSceneTextStats(scene).wordCount).toBe(2);
  });

  it("defaults to word count for mixed-script text", () => {
    const scene = {
      sections: [
        {
          lines: [
            {
              actions: {
                dialogue: {
                  content: [{ text: "Hello world 你好" }],
                },
              },
            },
          ],
        },
      ],
    };

    const stats = buildSceneTextStats(scene);

    expect(stats).toEqual({
      lineCount: 1,
      wordCount: 3,
      characterCount: 12,
    });
  });

  it("counts non-whitespace graphemes for Japanese projects", () => {
    const scene = {
      sections: [
        {
          lines: [
            {
              actions: {
                dialogue: {
                  content: [{ text: "春の雨。" }],
                },
                choice: {
                  items: [{ content: "帰る" }],
                },
              },
            },
          ],
        },
      ],
    };

    expect(buildSceneTextStats(scene, { language: "ja" })).toEqual({
      lineCount: 1,
      wordCount: 3,
      characterCount: 6,
    });
  });

  it("counts punctuation as characters for Chinese projects", () => {
    const scene = {
      sections: [
        {
          lines: [
            {
              actions: {
                dialogue: {
                  content: [{ text: "你好，世界！" }],
                },
                choice: {
                  items: [{ content: "回家" }],
                },
              },
            },
          ],
        },
      ],
    };

    expect(buildSceneTextStats(scene, { language: "zh-Hans" })).toEqual({
      lineCount: 1,
      wordCount: 3,
      characterCount: 8,
    });
  });

  it("counts repository-shaped scene sections and lines", () => {
    const scene = {
      sections: {
        items: {
          "section-1": {
            id: "section-1",
            lines: {
              items: {
                "line-1": {
                  id: "line-1",
                  actions: {
                    dialogue: {
                      content: [{ text: "Hello world" }],
                    },
                    choice: {
                      items: [{ content: "Go home" }],
                    },
                  },
                },
              },
              tree: [{ id: "line-1" }],
            },
          },
        },
        tree: [{ id: "section-1" }],
      },
    };

    expect(getSceneTextForStats(scene)).toBe("Hello world\nGo home");
    expect(buildSceneTextStats(scene)).toEqual({
      lineCount: 1,
      wordCount: 4,
      characterCount: 16,
    });
  });

  it("counts line records that have no dialogue or choice text", () => {
    const scene = {
      sections: [
        {
          lines: [{ actions: {} }, { actions: { visual: { items: [] } } }],
        },
      ],
    };

    expect(buildSceneTextStats(scene)).toEqual({
      lineCount: 2,
      wordCount: 0,
      characterCount: 0,
    });
  });

  it("joins the line and word labels with the catalog summary", () => {
    expect(
      formatSceneTextStatsLabel(
        { lineCount: 2, wordCount: 5, characterCount: 20 },
        { language: "ru", copy: RU_I18N.scenesPage },
      ),
    ).toBe("Строк: 2 · Слов: 5");
  });

  it("uses the singular for 0 in French", () => {
    const copy = FR_I18N.scenesPage;
    const label = formatSceneTextStatsLabel(
      { lineCount: 0, wordCount: 1, characterCount: 3 },
      { language: "fr", copy, dateTime: FR_I18N.dateTime },
    );

    expect(label).toBe(
      copy.sceneTextStatsSummary
        .replace("{lineLabel}", copy.sceneTextStatsLineLabel)
        .replace("{textCountLabel}", copy.sceneTextStatsWordLabel)
        .replace("{count}", "0")
        .replace("{count}", "1"),
    );
  });
});
