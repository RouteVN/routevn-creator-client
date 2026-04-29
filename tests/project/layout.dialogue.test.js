import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };

describe("dialogue layout projection", () => {
  it("projects ADV dialogue content for append-compatible text reveal", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "dialogue-text",
          type: "text-revealing-ref-dialogue-content",
          revealEffect: "typewriter",
        },
      ],
      {},
      emptyCollection,
      emptyCollection,
      emptyCollection,
      { layoutId: "layout-1" },
    );

    expect(elements[0]).toMatchObject({
      id: "dialogue-text",
      type: "text-revealing",
      content: "${dialogue.content}",
      initialRevealedCharacters: "${dialogue.initialRevealedCharacters}",
      speed: "${runtime.dialogueTextSpeed}",
      revealEffect: "typewriter",
    });
  });
});
