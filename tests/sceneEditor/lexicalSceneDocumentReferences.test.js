import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";
import {
  $createMentionNode,
  MentionNode,
  applyFuriganaToNode,
  applyTextStyleIdToNode,
} from "../../src/primitives/lexicalRichTextShared.js";
import {
  getAdjacentReferenceNodeForCollapsedSelection,
  getReferenceRichTextStateFromNode,
  getReferenceSelectionInfo,
  getReferenceSnapshotFromMentionNode,
  placeCaretAroundReferenceNode,
  selectReferenceNodeAsElement,
} from "../../src/primitives/lexicalSceneDocumentReferences.js";

const createReferenceEditor = () => {
  return createEditor({
    namespace: "reference-helper-test",
    nodes: [MentionNode],
    onError: (error) => {
      throw error;
    },
  });
};

const createReferenceLine = () => {
  const paragraph = $createParagraphNode();
  const mentionNode = $createMentionNode({
    resourceId: "variable-player-name",
    label: "Player Name",
  });

  paragraph.append(
    $createTextNode("before "),
    mentionNode,
    $createTextNode(" after"),
  );
  $getRoot().append(paragraph);

  return { paragraph, mentionNode };
};

describe("lexical scene document reference helpers", () => {
  it("selects a reference as one atomic element range", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const { mentionNode } = createReferenceLine();

        selectReferenceNodeAsElement(mentionNode);

        const selection = $getSelection();
        const selectionInfo = getReferenceSelectionInfo(selection);
        result = {
          nodeKey: selectionInfo?.node.getKey(),
          isWhole: selectionInfo?.isWhole,
          isCollapsed: selectionInfo?.isCollapsed,
        };
      },
      { discrete: true },
    );

    expect(result).toMatchObject({
      isWhole: true,
      isCollapsed: false,
    });
    expect(result.nodeKey).toBeTruthy();
  });

  it("moves the caret before and after an atomic reference", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const { paragraph, mentionNode } = createReferenceLine();
        const mentionIndex = mentionNode.getIndexWithinParent();

        placeCaretAroundReferenceNode(mentionNode, -1);
        const beforeSelection = $getSelection();
        const beforePoint = $isRangeSelection(beforeSelection)
          ? {
              key: beforeSelection.anchor.key,
              offset: beforeSelection.anchor.offset,
            }
          : undefined;

        placeCaretAroundReferenceNode(mentionNode, 1);
        const afterSelection = $getSelection();
        const afterPoint = $isRangeSelection(afterSelection)
          ? {
              key: afterSelection.anchor.key,
              offset: afterSelection.anchor.offset,
            }
          : undefined;

        result = {
          paragraphKey: paragraph.getKey(),
          mentionIndex,
          before: beforePoint,
          after: afterPoint,
        };
      },
      { discrete: true },
    );

    expect(result.before).toEqual({
      key: result.paragraphKey,
      offset: result.mentionIndex,
    });
    expect(result.after).toEqual({
      key: result.paragraphKey,
      offset: result.mentionIndex + 1,
    });
  });

  it("detects adjacent reference nodes from collapsed element selections", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const { paragraph, mentionNode } = createReferenceLine();
        const mentionKey = mentionNode.getKey();
        const mentionIndex = mentionNode.getIndexWithinParent();

        paragraph.select(mentionIndex, mentionIndex);
        const beforeSelection = $getSelection();
        const nextReference = getAdjacentReferenceNodeForCollapsedSelection(
          beforeSelection,
          1,
        );

        paragraph.select(mentionIndex + 1, mentionIndex + 1);
        const afterSelection = $getSelection();
        const previousReference = getAdjacentReferenceNodeForCollapsedSelection(
          afterSelection,
          -1,
        );

        result = {
          mentionKey,
          nextReferenceKey: nextReference?.getKey(),
          previousReferenceKey: previousReference?.getKey(),
        };
      },
      { discrete: true },
    );

    expect(result.nextReferenceKey).toBe(result.mentionKey);
    expect(result.previousReferenceKey).toBe(result.mentionKey);
  });

  it("reads reference snapshot and rich-text metadata from mention nodes", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const { mentionNode } = createReferenceLine();
        applyTextStyleIdToNode(mentionNode, "style-1");
        applyFuriganaToNode(mentionNode, {
          text: "プレイヤー",
          textStyleId: "furigana-style-1",
        });

        result = {
          snapshot: getReferenceSnapshotFromMentionNode(mentionNode),
          richText: getReferenceRichTextStateFromNode(mentionNode),
        };
      },
      { discrete: true },
    );

    expect(result.snapshot).toMatchObject({
      resourceId: "variable-player-name",
      label: "Player Name",
    });
    expect(result.richText).toEqual({
      textStyleId: "style-1",
      furigana: {
        text: "プレイヤー",
        textStyleId: "furigana-style-1",
      },
    });
  });
});
