import { describe, expect, it } from "vitest";
import {
  buildSceneTextStats,
  getSceneTextForStats,
} from "../../src/internal/ui/sceneEditorLexical/textStats.js";

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
      wordCount: 9,
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
      wordCount: 3,
    });
  });
});
