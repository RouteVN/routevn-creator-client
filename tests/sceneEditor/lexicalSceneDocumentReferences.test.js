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
import { EDITOR_CARET_TEXT } from "../../src/internal/ui/sceneEditorLexical/contentModel.js";
import {
  getAdjacentReferenceNodeInfoForCollapsedSelection,
  getAdjacentReferenceNodeForCollapsedSelection,
  getReferenceRichTextStateFromNode,
  getReferenceSelectionInfo,
  getReferenceSnapshotFromMentionNode,
  placeCaretAroundReferenceNode,
  selectReferenceNodeAsElement,
} from "../../src/primitives/lexicalSceneDocumentReferences.js";
import { applySelectionToLineNode } from "../../src/primitives/lexicalSceneDocumentSelection.js";

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

  it("moves the caret after the hidden anchor for a final atomic reference", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        const mentionNode = $createMentionNode({
          resourceId: "age",
          label: "Age",
        });
        const trailingAnchorNode = $createTextNode(EDITOR_CARET_TEXT);
        paragraph.append(
          $createTextNode("prefix "),
          mentionNode,
          trailingAnchorNode,
        );
        $getRoot().append(paragraph);

        placeCaretAroundReferenceNode(mentionNode, 1);
        const selection = $getSelection();
        const point = $isRangeSelection(selection)
          ? {
              key: selection.anchor.key,
              offset: selection.anchor.offset,
            }
          : undefined;

        result = {
          paragraphKey: paragraph.getKey(),
          afterHiddenAnchorOffset:
            trailingAnchorNode.getIndexWithinParent() + 1,
          point,
        };
      },
      { discrete: true },
    );

    expect(result.point).toEqual({
      key: result.paragraphKey,
      offset: result.afterHiddenAnchorOffset,
    });
  });

  it("maps content offsets around references to atomic element positions", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const { paragraph, mentionNode } = createReferenceLine();
        const mentionIndex = mentionNode.getIndexWithinParent();
        const afterReferenceTextNode = mentionNode.getNextSibling();

        applySelectionToLineNode(paragraph, {
          start: 7,
          end: 7,
        });
        const beforeReferenceSelection = $getSelection();
        const beforeReferencePoint = $isRangeSelection(beforeReferenceSelection)
          ? {
              key: beforeReferenceSelection.anchor.key,
              offset: beforeReferenceSelection.anchor.offset,
              type: beforeReferenceSelection.anchor.type,
            }
          : undefined;

        applySelectionToLineNode(paragraph, {
          start: 8,
          end: 8,
        });
        const insideReferenceSelection = $getSelection();
        const insideReferencePoint = $isRangeSelection(insideReferenceSelection)
          ? {
              key: insideReferenceSelection.anchor.key,
              offset: insideReferenceSelection.anchor.offset,
              type: insideReferenceSelection.anchor.type,
            }
          : undefined;

        applySelectionToLineNode(paragraph, {
          start: 18,
          end: 18,
        });
        const afterReferenceSelection = $getSelection();
        const afterReferencePoint = $isRangeSelection(afterReferenceSelection)
          ? {
              key: afterReferenceSelection.anchor.key,
              offset: afterReferenceSelection.anchor.offset,
              type: afterReferenceSelection.anchor.type,
            }
          : undefined;

        const leadingReferenceParagraph = $createParagraphNode();
        const leadingReferenceNode = $createMentionNode({
          resourceId: "leading-reference",
          label: "Age",
        });
        leadingReferenceParagraph.append(
          leadingReferenceNode,
          $createTextNode(" suffix"),
        );
        $getRoot().append(leadingReferenceParagraph);
        const leadingMentionIndex = leadingReferenceNode.getIndexWithinParent();

        applySelectionToLineNode(leadingReferenceParagraph, {
          start: 0,
          end: 0,
        });
        const beforeLeadingReferenceSelection = $getSelection();
        const beforeLeadingReferencePoint = $isRangeSelection(
          beforeLeadingReferenceSelection,
        )
          ? {
              key: beforeLeadingReferenceSelection.anchor.key,
              offset: beforeLeadingReferenceSelection.anchor.offset,
              type: beforeLeadingReferenceSelection.anchor.type,
            }
          : undefined;

        applySelectionToLineNode(leadingReferenceParagraph, {
          start: 1,
          end: 1,
        });
        const insideLeadingReferenceSelection = $getSelection();
        const insideLeadingReferencePoint = $isRangeSelection(
          insideLeadingReferenceSelection,
        )
          ? {
              key: insideLeadingReferenceSelection.anchor.key,
              offset: insideLeadingReferenceSelection.anchor.offset,
              type: insideLeadingReferenceSelection.anchor.type,
            }
          : undefined;

        const trailingReferenceParagraph = $createParagraphNode();
        const trailingReferenceNode = $createMentionNode({
          resourceId: "trailing-reference",
          label: "Age",
        });
        const trailingAnchorNode = $createTextNode(EDITOR_CARET_TEXT);
        trailingReferenceParagraph.append(
          $createTextNode("prefix "),
          trailingReferenceNode,
          trailingAnchorNode,
        );
        $getRoot().append(trailingReferenceParagraph);

        applySelectionToLineNode(trailingReferenceParagraph, {
          start: 10,
          end: 10,
        });
        const trailingReferenceEndSelection = $getSelection();
        const trailingReferenceEndPoint = $isRangeSelection(
          trailingReferenceEndSelection,
        )
          ? {
              key: trailingReferenceEndSelection.anchor.key,
              offset: trailingReferenceEndSelection.anchor.offset,
              type: trailingReferenceEndSelection.anchor.type,
            }
          : undefined;

        result = {
          paragraphKey: paragraph.getKey(),
          mentionIndex,
          afterReferenceTextKey: afterReferenceTextNode?.getKey(),
          beforeReferencePoint,
          insideReferencePoint,
          afterReferencePoint,
          leadingReferenceParagraphKey: leadingReferenceParagraph.getKey(),
          leadingMentionIndex,
          beforeLeadingReferencePoint,
          insideLeadingReferencePoint,
          trailingAnchorKey: trailingAnchorNode.getKey(),
          trailingReferenceEndPoint,
        };
      },
      { discrete: true },
    );

    expect(result.beforeReferencePoint).toMatchObject({
      offset: 7,
      type: "text",
    });
    expect(result.insideReferencePoint).toEqual({
      key: result.paragraphKey,
      offset: result.mentionIndex + 1,
      type: "element",
    });
    expect(result.afterReferencePoint).toEqual({
      key: result.afterReferenceTextKey,
      offset: 0,
      type: "text",
    });
    expect(result.beforeLeadingReferencePoint).toEqual({
      key: result.leadingReferenceParagraphKey,
      offset: result.leadingMentionIndex,
      type: "element",
    });
    expect(result.insideLeadingReferencePoint).toEqual({
      key: result.leadingReferenceParagraphKey,
      offset: result.leadingMentionIndex + 1,
      type: "element",
    });
    expect(result.trailingReferenceEndPoint).toEqual({
      key: result.trailingAnchorKey,
      offset: EDITOR_CARET_TEXT.length,
      type: "text",
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

  it("detects a reference before a trailing hidden caret anchor", () => {
    const editor = createReferenceEditor();
    let result;

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        const mentionNode = $createMentionNode({
          resourceId: "age",
          label: "Age",
        });
        const trailingAnchorNode = $createTextNode(EDITOR_CARET_TEXT);
        const extraTrailingAnchorNode = $createTextNode(EDITOR_CARET_TEXT);
        paragraph.append(
          $createTextNode("prefix "),
          mentionNode,
          trailingAnchorNode,
          extraTrailingAnchorNode,
        );
        $getRoot().append(paragraph);

        trailingAnchorNode.select(
          EDITOR_CARET_TEXT.length,
          EDITOR_CARET_TEXT.length,
        );
        const adjacentReference = getAdjacentReferenceNodeForCollapsedSelection(
          $getSelection(),
          -1,
        );
        paragraph.select(4, 4);
        const elementBoundaryAdjacentReference =
          getAdjacentReferenceNodeForCollapsedSelection($getSelection(), -1);
        const elementBoundaryAdjacentReferenceInfo =
          getAdjacentReferenceNodeInfoForCollapsedSelection(
            $getSelection(),
            -1,
          );
        result = {
          mentionKey: mentionNode.getKey(),
          adjacentReferenceKey: adjacentReference?.getKey(),
          elementBoundaryAdjacentReferenceKey:
            elementBoundaryAdjacentReference?.getKey(),
          skippedZeroLengthText:
            elementBoundaryAdjacentReferenceInfo?.skippedZeroLengthText,
        };
      },
      { discrete: true },
    );

    expect(result.adjacentReferenceKey).toBe(result.mentionKey);
    expect(result.elementBoundaryAdjacentReferenceKey).toBe(result.mentionKey);
    expect(result.skippedZeroLengthText).toBe(true);
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
