import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PT_LABELS = {
  changeVariable: "Alterar variável",
  removeVariable: "Remover variável",
  addTextStyle: "Adicionar estilo de texto",
  editTextStyle: "Editar estilo de texto",
  removeTextStyle: "Remover estilo de texto",
  addRubyText: "Adicionar texto ruby",
  editRubyText: "Editar texto ruby",
  removeRubyText: "Remover texto ruby",
  noVariables: "Sem variáveis",
  noTextStyles: "Sem estilos de texto",
  variableTypes: {
    string: "texto",
    number: "número",
    boolean: "booleano",
  },
};

let LexicalSceneDocumentEditorElement;

const createEditor = (menuLabels) => {
  const editor = Object.create(LexicalSceneDocumentEditorElement.prototype);
  editor.state = {
    mentionTargets: [],
    textStyles: [],
  };
  editor.menuLabels = menuLabels;
  return editor;
};

const getLabels = (items) => items.map((item) => item.label);

beforeEach(async () => {
  const dom = new JSDOM("<!doctype html>");
  for (const name of [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "ShadowRoot",
  ]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  ({ LexicalSceneDocumentEditorElement } = await import(
    "../../src/primitives/lexicalSceneDocumentEditor.js"
  ));
});

describe("scene document editor menu labels", () => {
  it("shows English labels when the owner passes none", () => {
    const editor = createEditor(undefined);

    expect(
      getLabels(
        editor.getRichTextMenuItems({ textStyleId: "style-1", furigana: "" }),
      ),
    ).toEqual(["Edit text style", "Add ruby text", "Remove text style"]);
    expect(getLabels(editor.getTextStyleMenuItems())).toEqual([
      "No text styles",
    ]);
    expect(getLabels(editor.getReferenceVariableMenuItems())).toEqual([
      "No variables",
    ]);
  });

  it("shows the labels passed by the owner in the text menu", () => {
    const editor = createEditor(PT_LABELS);
    const selectionMenu = {};
    editor.refs = { selectionMenu };
    editor.getRichTextStateForSelectionSnapshot = () => ({
      textStyleId: "style-1",
      furigana: "かな",
    });

    editor.showSelectionPopover(
      { clientX: 10, clientY: 20 },
      { selectionSnapshot: { lineId: "line-1", start: 0, end: 2 } },
    );

    expect(selectionMenu.open).toBe(true);
    expect(getLabels(selectionMenu.items)).toEqual([
      "Editar estilo de texto",
      "Editar texto ruby",
      "Remover estilo de texto",
      "Remover texto ruby",
    ]);
  });

  it("shows the labels passed by the owner in the variable menu", () => {
    const editor = createEditor(PT_LABELS);
    const selectionMenu = {};
    editor.refs = { selectionMenu };
    editor.selectReferenceByNodeKey = vi.fn();
    editor.getReferenceRichTextState = () => ({});

    editor.showReferencePopover(
      { clientX: 10, clientY: 20 },
      { nodeKey: "node-1" },
    );

    expect(getLabels(selectionMenu.items)).toEqual([
      "Alterar variável",
      "Remover variável",
      "Adicionar estilo de texto",
      "Adicionar texto ruby",
    ]);
  });

  it("shows the owner's empty list labels", () => {
    const editor = createEditor(PT_LABELS);

    expect(getLabels(editor.getTextStyleMenuItems())).toEqual([
      "Sem estilos de texto",
    ]);
    expect(getLabels(editor.getReferenceVariableMenuItems())).toEqual([
      "Sem variáveis",
    ]);
  });

  it("shows the owner's variable type names after each variable", () => {
    const editor = createEditor(PT_LABELS);
    editor.state.mentionTargets = [
      { id: "variable-1", label: "playerName", variableType: "string" },
      { id: "variable-2", label: "score", variableType: "number" },
      { id: "variable-3", label: "visits", variableType: "integer" },
    ];

    expect(
      editor
        .getReferenceVariableMenuItems()
        .map(({ label, suffixText }) => [label, suffixText]),
    ).toEqual([
      ["playerName", "texto"],
      ["score", "número"],
      ["visits", "integer"],
    ]);
  });

  it("shows the owner's variable type names in the / mention menu", () => {
    const editor = createEditor(PT_LABELS);
    const mentionMenu = {};
    editor.refs = { mentionMenu };
    editor.getMentionMenuPopover = () => ({});
    editor.syncMentionMenuPopover = vi.fn();
    editor.state.mentionMenu = {
      isOpen: true,
      left: 0,
      top: 0,
      items: [
        { id: "variable-1", label: "playerName", variableType: "string" },
        { id: "variable-2", label: "score", variableType: "number" },
      ],
    };

    editor.renderMentionMenu();

    expect(mentionMenu.items.map((item) => item.suffixText)).toEqual([
      "texto",
      "número",
    ]);
  });

  it("uses new labels after the owner passes them again", () => {
    const editor = createEditor(PT_LABELS);

    editor.menuLabels = {
      noTextStyles: "Нет стилей текста",
      variableTypes: { string: "текст" },
    };
    editor.state.mentionTargets = [
      { id: "variable-1", label: "playerName", variableType: "string" },
    ];

    expect(getLabels(editor.getTextStyleMenuItems())).toEqual([
      "Нет стилей текста",
    ]);
    expect(editor.getReferenceVariableMenuItems()[0].suffixText).toBe("текст");
    // Labels the owner leaves out fall back to English.
    expect(getLabels(editor.getRichTextMenuItems({}))).toEqual([
      "Add text style",
      "Add ruby text",
    ]);
  });
});
