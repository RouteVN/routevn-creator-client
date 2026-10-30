import { describe, expect, it } from "vitest";
import { h } from "snabbdom/build/h.js";
import { parseView } from "../../node_modules/@rettangoli/fe/src/parser.js";
import jemplParse from "../../node_modules/@rettangoli/fe/node_modules/jempl/src/parse/index.js";
import { selectViewData } from "../../src/components/sceneDocumentEditorLexical/sceneDocumentEditorLexical.store.js";
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
} from "../support/i18n.js";
import { loadViewTemplate } from "../support/renderView.js";

const LOCALES = {
  en: EN_I18N,
  ja: JA_I18N,
  "zh-hans": ZH_HANS_I18N,
  es: ES_I18N,
  th: TH_I18N,
  ru: RU_I18N,
  pt: PT_I18N,
  fr: FR_I18N,
  vi: VI_I18N,
};

const findEditorNode = (node) => {
  if (node?.sel?.startsWith("rvn-lexical-scene-document-editor")) {
    return node;
  }
  for (const child of node?.children ?? []) {
    const found = findEditorNode(child);
    if (found) {
      return found;
    }
  }
  return undefined;
};

describe("scene document editor menu labels", () => {
  it("builds the menu labels from the current locale", () => {
    const { menuLabels } = selectViewData({ props: {}, i18n: PT_I18N });

    expect(menuLabels).toEqual({
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
    });
  });

  it.each(Object.entries(LOCALES))("has every menu label in %s", (_, i18n) => {
    const { menuLabels } = selectViewData({ props: {}, i18n });
    const { variableTypes, ...labels } = menuLabels;

    for (const label of [
      ...Object.values(labels),
      ...Object.values(variableTypes),
    ]) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("passes the menu labels to the editor element", () => {
    const viewData = selectViewData({ props: {}, i18n: JA_I18N });
    const vdom = parseView({
      h,
      template: jemplParse(
        loadViewTemplate(
          "src/components/sceneDocumentEditorLexical/sceneDocumentEditorLexical.view.yaml",
        ),
      ),
      viewData,
      refs: {},
      handlers: {},
    });

    const editorNode = findEditorNode(vdom);
    expect(editorNode.data.props.menuLabels).toBe(viewData.menuLabels);
    expect(editorNode.data.props.menuLabels.changeVariable).toBe("変数を変更");
  });
});
