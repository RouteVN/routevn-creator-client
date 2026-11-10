import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { createLayoutElementsFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";
import { applyLayoutItemFieldChange } from "../../src/pages/layoutEditor/support/layoutEditorMutations.js";
import { selectLayoutEditorPageCopy } from "../../src/pages/layoutEditor/support/layoutEditorPageCopy.js";
import { toLayoutEditorContextMenuItems } from "../../src/pages/layoutEditor/support/layoutEditorViewData.js";
import { createInputLayoutElements } from "../../src/pages/layouts/support/inputLayoutTemplate.js";
import { selectInputLayoutTemplateCopy } from "../../src/pages/layouts/support/layoutsPageCopy.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const projectResolution = {
  width: 1920,
  height: 1080,
};

const textStylesData = {
  items: {
    "folder-1": {
      id: "folder-1",
      type: "folder",
      name: "Styles",
    },
    "style-1": {
      id: "style-1",
      type: "textStyle",
      name: "Default",
    },
    "style-2": {
      id: "style-2",
      type: "textStyle",
      name: "Title",
    },
  },
  tree: [
    {
      id: "folder-1",
      children: [{ id: "style-1" }, { id: "style-2" }],
    },
  ],
};

const layoutEditorConstants = yaml.load(
  readFileSync(
    new URL(
      "../../src/pages/layoutEditor/layoutEditor.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const defaultRepositoryTemplate = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

// The item of the layout editor's Add Element menu, as the editor builds it.
const getAddElementMenuItem = ({ createType, i18n }) => {
  const menuItem = layoutEditorConstants.emptyContextMenuItems.find(
    (item) => item.createType === createType,
  );
  const [addElementMenuItem] = toLayoutEditorContextMenuItems(
    [menuItem],
    projectResolution,
    selectLayoutEditorPageCopy(i18n),
  );
  return addElementMenuItem;
};

// Adds an element the way the layout editor does when the user picks it from
// the Add Element menu, and returns the element it stores.
const addElementInLayoutEditor = async ({
  createType,
  parentId,
  i18n,
  textStyles,
}) => {
  const createLayoutElement = vi.fn(async () => ({ valid: true }));
  const { handleFileExplorerAction } = createLayoutElementsFileExplorerHandlers(
    {
      getLayoutId: () => "layout-1",
      copy: {},
    },
  );

  await handleFileExplorerAction(
    {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          textStyles,
        }),
        createLayoutElement,
        updateLayoutElement: vi.fn(),
        deleteLayoutElement: vi.fn(),
      },
    },
    {
      _event: {
        detail: {
          item: getAddElementMenuItem({ createType, i18n }),
          itemId: parentId,
        },
      },
    },
  );

  expect(createLayoutElement).toHaveBeenCalledTimes(1);
  const { elementId, data } = createLayoutElement.mock.calls[0][0];
  return {
    id: elementId,
    ...data,
  };
};

// Changes the element's fields the way the layout editor's edit panel does.
const editInPanel = (item, changes) => {
  return changes.reduce(
    (currentItem, [name, value]) =>
      applyLayoutItemFieldChange({ item: currentItem, name, value }),
    item,
  );
};

// The Input layout a user builds by hand in the layout editor: a prompt, an
// input below it, and a submit button below that, centered horizontally and
// above the middle of the screen.
const buildInputLayoutInLayoutEditor = async ({ i18n, textStyles }) => {
  const { promptText, submitText } = selectInputLayoutTemplateCopy(i18n);
  const topCenter = { x: 0.5, y: 0 };

  const promptTextElement = editInPanel(
    await addElementInLayoutEditor({ createType: "text", i18n, textStyles }),
    [
      ["anchor", topCenter],
      ["x", "960"],
      ["y", "340"],
      ["textStyle.align", "center"],
      ["content", [{ text: promptText }]],
    ],
  );
  const inputElement = editInPanel(
    await addElementInLayoutEditor({ createType: "input", i18n, textStyles }),
    [
      ["anchor", topCenter],
      ["x", "960"],
      ["y", "390"],
    ],
  );
  const submitContainerElement = editInPanel(
    await addElementInLayoutEditor({
      createType: "form-submit-button",
      i18n,
      textStyles,
    }),
    [
      ["anchor", topCenter],
      ["x", "960"],
      ["y", "472"],
    ],
  );
  const submitTextElement = editInPanel(
    await addElementInLayoutEditor({
      createType: "text",
      parentId: submitContainerElement.id,
      i18n,
      textStyles,
    }),
    [["content", [{ text: submitText }]]],
  );

  return {
    promptTextElement,
    inputElement,
    submitContainerElement,
    submitTextElement,
  };
};

const withoutId = ({ id: _id, ...item }) => item;

// The template's elements in screen order, without their ids.
const toTemplateElements = (elements) => {
  const [promptTextNode, inputNode, submitContainerNode] = elements.tree;
  const [submitTextNode] = submitContainerNode.children;

  return {
    promptTextElement: withoutId(elements.items[promptTextNode.id]),
    inputElement: withoutId(elements.items[inputNode.id]),
    submitContainerElement: withoutId(elements.items[submitContainerNode.id]),
    submitTextElement: withoutId(elements.items[submitTextNode.id]),
  };
};

// The elements with each id replaced by the element's place in the tree.
const withTreeOrderIds = (elements) => {
  const ids = new Map();
  const collectIds = (nodes) => {
    nodes.forEach((node) => {
      ids.set(node.id, `element-${ids.size + 1}`);
      collectIds(node.children ?? []);
    });
  };
  collectIds(elements.tree);

  const renameNode = (node) => ({
    id: ids.get(node.id),
    children: (node.children ?? []).map(renameNode),
  });

  return {
    items: Object.fromEntries(
      Object.entries(elements.items).map(([id, item]) => [
        ids.get(id) ?? id,
        {
          ...item,
          id: ids.get(id) ?? id,
        },
      ]),
    ),
    tree: elements.tree.map(renameNode),
  };
};

const toManualElements = (manualElements) => {
  return Object.fromEntries(
    Object.entries(manualElements).map(([role, item]) => [
      role,
      withoutId(item),
    ]),
  );
};

describe("createInputLayoutElements", () => {
  it.each([
    ["English", EN_I18N, textStylesData],
    ["Japanese", JA_I18N, textStylesData],
    ["English without text styles", EN_I18N, { items: {}, tree: [] }],
  ])(
    "matches the layout a user builds in the layout editor (%s)",
    async (_label, i18n, textStyles) => {
      const elements = createInputLayoutElements({
        projectResolution,
        textStylesData: textStyles,
        copy: selectInputLayoutTemplateCopy(i18n),
      });
      const manualElements = await buildInputLayoutInLayoutEditor({
        i18n,
        textStyles,
      });

      expect(toTemplateElements(elements)).toEqual(
        toManualElements(manualElements),
      );
    },
  );

  it("lists the elements in screen order with the button text inside the submit container", () => {
    const elements = createInputLayoutElements({
      projectResolution,
      textStylesData,
      copy: selectInputLayoutTemplateCopy(EN_I18N),
    });
    const { tree, items } = elements;

    expect(Object.keys(items)).toHaveLength(4);
    expect(tree.map((node) => items[node.id].type)).toEqual([
      "text",
      "input",
      "container",
    ]);
    expect(items[tree[0].id]).toMatchObject({
      text: "Enter your name",
      textStyleId: "style-1",
    });
    expect(items[tree[2].id].formRole).toBe("submit");
    expect(items[tree[2].children[0].id]).toMatchObject({
      type: "text",
      text: "Submit",
      textStyleId: "style-1",
    });
  });

  it("scales to the project's resolution", () => {
    const elements = createInputLayoutElements({
      projectResolution: {
        width: 1280,
        height: 720,
      },
      textStylesData,
      copy: selectInputLayoutTemplateCopy(EN_I18N),
    });
    const { promptTextElement, inputElement, submitContainerElement } =
      toTemplateElements(elements);

    expect(promptTextElement).toMatchObject({ x: 640, y: 227 });
    expect(inputElement).toMatchObject({
      x: 640,
      y: 260,
      width: 220,
      height: 35,
    });
    expect(submitContainerElement).toMatchObject({ x: 640, y: 315 });
  });

  it("is the Default Input layout of the default project template", () => {
    const templateLayout = Object.values(
      defaultRepositoryTemplate.layouts.items,
    ).find((layout) => layout.name === "Default Input");

    expect(templateLayout).toMatchObject({
      type: "layout",
      layoutType: "input",
      isFragment: false,
    });
    expect(withTreeOrderIds(templateLayout.elements)).toEqual(
      withTreeOrderIds(
        createInputLayoutElements({
          projectResolution,
          textStylesData: defaultRepositoryTemplate.textStyles,
          copy: selectInputLayoutTemplateCopy(EN_I18N),
        }),
      ),
    );
  });
});
