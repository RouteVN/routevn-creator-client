import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  openConditionalOverrideConditionDialog,
  selectViewData,
  setConditionalOverrideConditionDialogDraftSet,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleConditionalOverrideAnchorChange,
  handleConditionalOverrideAttributeClick,
  handleConditionalOverrideAttributeFormAction,
  handleConditionalOverrideAttributeImageClick,
  handleConditionalOverrideAttributeImageKeyDown,
  handleConditionalOverrideConditionClick,
  handleConditionalOverrideConditionFormAction,
  handleConditionalOverrideContextMenu,
  handleConditionalOverrideDraftAttributeContextMenu,
  handleImageSelectorSubmit,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createConditionalOverrideAnchorOptions,
  createConditionalOverrideAttributeForm,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelConditionalOverrides.js";
import { EN_I18N } from "../support/i18n.js";

const RULES = [
  {
    when: { target: "variables['enabled']", op: "eq", value: true },
    set: { visible: true },
  },
  {
    when: { target: "variables['score']", op: "eq", value: 10 },
    set: { opacity: 0.5 },
  },
];

const createDeps = ({ confirmed } = {}) => {
  const values = { conditionalOverrides: structuredClone(RULES) };
  const store = {
    selectValues: vi.fn(() => values),
    updateValueProperty: vi.fn(({ name, value }) => {
      values[name] = value;
    }),
  };

  return {
    values,
    store,
    appService: {
      showDropdownMenu: vi.fn(async () => ({ item: { key: "delete" } })),
      showDialog: vi.fn(async () => confirmed),
    },
    dispatchEvent: vi.fn(),
    i18n: EN_I18N,
    render: vi.fn(),
  };
};

const createPayload = (index = 0) => ({
  _event: {
    preventDefault: vi.fn(),
    clientX: 40,
    clientY: 60,
    currentTarget: { dataset: { index: String(index) } },
  },
});

describe("layoutEditPanel conditional overrides", () => {
  it("uses the nine-cell selector for conditional anchor overrides", () => {
    const form = createConditionalOverrideAttributeForm({
      attributeOptions: [{ label: "Anchor", value: "anchor" }],
      textStyleOptions: [],
      submitLabel: "Save",
      copy: {},
    });
    const anchorField = form.fields.find(
      (field) => field.$when === "fieldName == 'anchor'",
    );
    const options = createConditionalOverrideAnchorOptions({});
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(anchorField).toEqual({
      $when: "fieldName == 'anchor'",
      type: "slot",
      slot: "conditional-override-anchor",
      label: "Anchor",
    });
    expect(options).toHaveLength(9);
    expect(options[4]).toEqual({
      label: "Center",
      value: { x: 0.5, y: 0.5 },
    });
    expect(view).toContain(
      "rvn-layout-anchor-grid#conditionalOverrideAnchor slot=conditional-override-anchor",
    );
  });

  it("tracks the selected conditional anchor", () => {
    const store = {
      setConditionalOverrideAttributeDialogAnchor: vi.fn(),
    };
    const render = vi.fn();

    handleConditionalOverrideAnchorChange(
      { store, render },
      {
        _event: {
          detail: { value: { x: 1, y: 0.5 } },
        },
      },
    );

    expect(
      store.setConditionalOverrideAttributeDialogAnchor,
    ).toHaveBeenCalledWith({ anchor: { x: 1, y: 0.5 } });
    expect(render).toHaveBeenCalledOnce();
  });

  it("prefills the grid when editing a conditional anchor in the draft", () => {
    const store = {
      selectConditionalOverrideDraftSet: vi.fn(() => ({
        anchorX: 0.5,
        anchorY: 1,
      })),
      openConditionalOverrideAttributeDialog: vi.fn(),
    };
    const render = vi.fn();

    handleConditionalOverrideAttributeClick(
      { store, render },
      { _event: { currentTarget: { dataset: { fieldName: "anchor" } } } },
    );

    expect(store.openConditionalOverrideAttributeDialog).toHaveBeenCalledWith({
      fieldName: "anchor",
      selectedImageId: undefined,
      selectedAnchor: { x: 0.5, y: 1 },
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("shows each override as a card that opens its dialog, with no buttons of its own", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const conditionalBlock = view.slice(
      view.indexOf("$elif item.type == 'conditional-override-list'"),
      view.indexOf("$elif item.type == 'pagination-summary'"),
    );
    const dialogBlock = view.slice(
      view.indexOf("rtgl-dialog#conditionalOverrideConditionDialog"),
      view.indexOf("rtgl-dialog#conditionalOverrideAttributeDialog"),
    );

    expect(conditionalBlock).toContain(
      "rtgl-view#conditionalOverrideItem${i}x${j}x${k}",
    );
    expect(conditionalBlock).toContain(
      "bgc=bg br=md bw=xs bc=bo h-bc=ac cur=pointer",
    );
    expect(conditionalBlock).not.toContain("h-bgc=");
    // Small labels name the condition and its attributes.
    expect(conditionalBlock.indexOf("${conditionLabel}")).toBeLessThan(
      conditionalBlock.indexOf("conditionalItem.summaryParts"),
    );
    expect(conditionalBlock.indexOf("${attributesLabel}")).toBeLessThan(
      conditionalBlock.indexOf("conditionalItem.attributeItems:"),
    );
    // The conditions stand apart.
    expect(conditionalBlock).toContain(
      "- rtgl-view d=v w=f g=md:\n                              - $for conditionalItem, k in item.items:",
    );
    // Deleting is in its right-click menu; attributes are edited in its
    // dialog.
    expect(conditionalBlock).not.toContain("rtgl-button");
    expect(view).not.toContain("handleConditionalOverrideDeleteClick");
    expect(view).not.toContain("handleConditionalOverrideAttributeDeleteClick");
    expect(view).toContain(`  conditionalOverrideItem*:
    eventListeners:
      click:
        handler: handleConditionalOverrideConditionClick
      contextmenu:
        handler: handleConditionalOverrideContextMenu`);
    // The dialog lists the attributes with a full-width Add Attribute.
    expect(dialogBlock).toContain(
      "rtgl-view slot=conditional-override-attributes",
    );
    expect(dialogBlock).toContain(
      "rtgl-view#conditionalOverrideDraftAttribute${i} key=${attributeItem.fieldName} data-field-name=${attributeItem.fieldName}",
    );
    expect(dialogBlock).toContain(
      "rtgl-button#conditionalOverrideDraftAddAttribute pre=plus s=sm v=ol w=f: ${addAttributeButton}",
    );
  });

  it("requires confirmation before deleting a condition", async () => {
    const cancelledDeps = createDeps({ confirmed: false });
    await handleConditionalOverrideContextMenu(cancelledDeps, createPayload());

    expect(cancelledDeps.appService.showDropdownMenu).toHaveBeenCalledWith({
      items: [{ type: "item", label: "Delete", key: "delete" }],
      x: 40,
      y: 60,
      place: "bs",
    });
    expect(cancelledDeps.appService.showDialog).toHaveBeenCalledWith({
      title: "Delete Condition?",
      message: "Delete this condition? This cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    expect(cancelledDeps.store.updateValueProperty).not.toHaveBeenCalled();

    const confirmedDeps = createDeps({ confirmed: true });
    await handleConditionalOverrideContextMenu(confirmedDeps, createPayload());

    expect(confirmedDeps.values.conditionalOverrides).toEqual([RULES[1]]);
    expect(confirmedDeps.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("preserves collaborative condition changes made before deletion is confirmed", async () => {
    const deps = createDeps({ confirmed: true });
    const addedRule = {
      when: { target: "variables['name']", op: "eq", value: "Ada" },
      set: { visible: false },
    };
    const updatedRule = {
      ...RULES[1],
      set: { opacity: 0.75 },
    };
    deps.appService.showDialog.mockImplementationOnce(async () => {
      deps.values.conditionalOverrides = [
        addedRule,
        structuredClone(RULES[0]),
        updatedRule,
      ];
      return true;
    });

    await handleConditionalOverrideContextMenu(deps, createPayload());

    expect(deps.values.conditionalOverrides).toEqual([addedRule, updatedRule]);
    expect(deps.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("deletes the selected rule when predicates are duplicated", async () => {
    const deps = createDeps({ confirmed: true });
    const duplicatedPredicate = structuredClone(RULES[0].when);
    const selectedRule = {
      when: duplicatedPredicate,
      set: { visible: true },
    };
    const remainingRule = {
      when: structuredClone(duplicatedPredicate),
      set: { opacity: 0.5 },
    };
    deps.values.conditionalOverrides = [selectedRule, remainingRule];

    await handleConditionalOverrideContextMenu(deps, createPayload(0));

    expect(deps.values.conditionalOverrides).toEqual([remainingRule]);
    expect(deps.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("opens the image browser and stores its selection in the attribute dialog", () => {
    const store = {
      selectConditionalOverrideAttributeDialog: vi.fn(() => ({
        selectedImageId: "image-before",
      })),
      openImageSelectorDialog: vi.fn(),
      selectTempSelectedImageId: vi.fn(() => "image-after"),
      selectImageSelectorDialog: vi.fn(() => ({
        source: "conditionalOverrideAttribute",
      })),
      setConditionalOverrideAttributeDialogImage: vi.fn(),
      closeImageSelectorDialog: vi.fn(),
    };
    const deps = { store, render: vi.fn() };

    handleConditionalOverrideAttributeImageClick(deps);
    expect(store.openImageSelectorDialog).toHaveBeenCalledWith({
      selectedImageId: "image-before",
      source: "conditionalOverrideAttribute",
    });

    handleImageSelectorSubmit(deps);
    expect(
      store.setConditionalOverrideAttributeDialogImage,
    ).toHaveBeenCalledWith({ imageId: "image-after" });
    expect(store.closeImageSelectorDialog).toHaveBeenCalledOnce();
  });

  it("stops Enter before opening the attribute image browser", () => {
    const store = {
      selectConditionalOverrideAttributeDialog: vi.fn(() => ({
        selectedImageId: "image-before",
      })),
      openImageSelectorDialog: vi.fn(),
    };
    const deps = { store, render: vi.fn() };
    const event = {
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleConditionalOverrideAttributeImageKeyDown(deps, { _event: event });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(store.openImageSelectorDialog).toHaveBeenCalledWith({
      selectedImageId: "image-before",
      source: "conditionalOverrideAttribute",
    });
  });

  it("uses the particle texture image card", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const imageFieldBlock = view.slice(
      view.indexOf("slot=conditional-override-image"),
      view.indexOf("rtgl-dialog#imageSelectorDialog"),
    );

    expect(imageFieldBlock).toContain(
      "slot=conditional-override-image d=v w=f",
    );
    expect(imageFieldBlock).toContain(
      "bc=${conditionalOverrideAttributeImagePreview.itemBorderColor} h-bc=${conditionalOverrideAttributeImagePreview.itemHoverBorderColor} br=md w=160 overflow=hidden",
    );
    expect(imageFieldBlock).toContain(
      'div.layoutEditorImageFieldTransparencyGrid style="display: block; width: 100%; aspect-ratio: ${conditionalOverrideAttributeImagePreview.previewAspectRatio}; overflow: hidden;"',
    );
    expect(imageFieldBlock).toContain(
      "rvn-file-image w=f h=f fileId=${conditionalOverrideAttributeImagePreview.previewFileId}",
    );
    expect(imageFieldBlock).toContain("rtgl-view w=f p=md");
    expect(imageFieldBlock).toContain(
      "conditionalOverrideAttributeImagePreview.name",
    );
    expect(imageFieldBlock).toContain(
      "conditionalOverrideAttributeImage role=button tabindex=0 aria-haspopup=dialog",
    );
    expect(imageFieldBlock).toContain(
      "w=160 h=90 av=c ah=c bgc=bg bc=bo bw=xs br=md",
    );
  });

  it("omits the cancel button from the image selector dialog", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const imageSelectorDialog = view.slice(
      view.indexOf("rtgl-dialog#imageSelectorDialog"),
      view.indexOf("rtgl-dialog#soundFormDialog"),
    );

    expect(imageSelectorDialog).toContain(
      "rtgl-button#confirmImageSelection variant=pr: ${selectButton}",
    );
    expect(imageSelectorDialog).not.toContain("cancelImageSelection");
  });

  it("puts the selected browser image into the dialog's draft", () => {
    const values = { conditionalOverrides: structuredClone(RULES) };
    const store = {
      selectConditionalOverrideAttributeDialog: vi.fn(() => ({
        selectedImageId: "image-selected",
      })),
      selectConditionalOverrideDraftSet: vi.fn(() => ({})),
      setConditionalOverrideConditionDialogDraftSet: vi.fn(),
      selectValues: vi.fn(() => values),
      updateValueProperty: vi.fn(),
      closeConditionalOverrideAttributeDialog: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      dispatchEvent: vi.fn(),
      i18n: EN_I18N,
    };

    handleConditionalOverrideAttributeFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: { fieldName: "imageId" },
        },
      },
    });

    expect(
      store.setConditionalOverrideConditionDialogDraftSet,
    ).toHaveBeenCalledWith({ draftSet: { imageId: "image-selected" } });
    // The override saves with its condition dialog's Save.
    expect(store.updateValueProperty).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(
      store.closeConditionalOverrideAttributeDialog,
    ).toHaveBeenCalledOnce();
  });

  it("puts the selected grid cell into the dialog's draft as an anchor", () => {
    const store = {
      selectConditionalOverrideAttributeDialog: vi.fn(() => ({
        selectedAnchor: { x: 0.5, y: 1 },
      })),
      selectConditionalOverrideDraftSet: vi.fn(() => ({ visible: true })),
      setConditionalOverrideConditionDialogDraftSet: vi.fn(),
      closeConditionalOverrideAttributeDialog: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      dispatchEvent: vi.fn(),
      i18n: EN_I18N,
    };

    handleConditionalOverrideAttributeFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: { fieldName: "anchor" },
        },
      },
    });

    expect(
      store.setConditionalOverrideConditionDialogDraftSet,
    ).toHaveBeenCalledWith({
      draftSet: { visible: true, anchorX: 0.5, anchorY: 1 },
    });
    expect(
      store.closeConditionalOverrideAttributeDialog,
    ).toHaveBeenCalledOnce();
  });

  it("opens a card's dialog with its condition and its attributes as the draft", () => {
    const deps = createDeps();
    deps.store.selectVisibilityConditionTargetTypeByTarget = vi.fn(() => ({
      "variables['score']": "number",
    }));
    deps.store.selectVisibilityConditionTargetValueKindByTarget = vi.fn(
      () => ({}),
    );
    deps.store.openConditionalOverrideConditionDialog = vi.fn();

    handleConditionalOverrideConditionClick(deps, createPayload(1));

    expect(
      deps.store.openConditionalOverrideConditionDialog,
    ).toHaveBeenCalledWith({
      editingIndex: 1,
      draftSet: { opacity: 0.5 },
      selectedVariableType: "number",
      selectedValueKind: "number",
    });
  });

  it("saves the condition with the draft's attributes", () => {
    const deps = createDeps();
    let draftSet = { opacity: 0.25, visible: false };
    let editingIndex = 1;
    Object.assign(deps.store, {
      selectVisibilityConditionTargetTypeByTarget: () => ({
        "variables['score']": "number",
      }),
      selectVisibilityConditionTargetValueKindByTarget: () => ({}),
      selectConditionalOverrideConditionDialog: () => ({ editingIndex }),
      selectConditionalOverrideDraftSet: () => draftSet,
      closeConditionalOverrideConditionDialog: vi.fn(),
      closePopoverForm: vi.fn(),
    });
    const submit = (values) =>
      handleConditionalOverrideConditionFormAction(deps, {
        _event: { detail: { actionId: "submit", values } },
      });

    submit({ target: "variables['score']", op: "eq", numberValue: 20 });
    expect(deps.values.conditionalOverrides[1]).toEqual({
      when: { target: "variables['score']", op: "eq", value: 20 },
      set: { opacity: 0.25, visible: false },
    });

    // A new override takes its condition and attributes together.
    editingIndex = undefined;
    draftSet = { opacity: 0.75 };
    submit({ target: "variables['score']", op: "eq", numberValue: 30 });
    expect(deps.values.conditionalOverrides).toHaveLength(3);
    expect(deps.values.conditionalOverrides[2]).toEqual({
      when: { target: "variables['score']", op: "eq", value: 30 },
      set: { opacity: 0.75 },
    });
  });

  it("removes an attribute from the draft from its right-click menu", async () => {
    const deps = createDeps();
    deps.appService.showDropdownMenu = vi.fn(async () => ({
      item: { key: "remove" },
    }));
    Object.assign(deps.store, {
      selectConditionalOverrideDraftSet: () => ({
        visible: false,
        opacity: 0.5,
      }),
      setConditionalOverrideConditionDialogDraftSet: vi.fn(),
    });
    const payload = createPayload();
    payload._event.currentTarget.dataset = { fieldName: "opacity" };

    await handleConditionalOverrideDraftAttributeContextMenu(deps, payload);

    expect(deps.appService.showDropdownMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ type: "item", label: "Remove", key: "remove" }],
      }),
    );
    expect(
      deps.store.setConditionalOverrideConditionDialogDraftSet,
    ).toHaveBeenCalledWith({ draftSet: { visible: false } });
    // Nothing saves until the dialog's Save.
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("lists the draft's attributes in the dialog, below the condition", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: { type: "text", conditionalOverrides: structuredClone(RULES) },
      },
    );
    openConditionalOverrideConditionDialog(
      { state },
      { editingIndex: 1, draftSet: { opacity: 0.5 } },
    );
    setConditionalOverrideConditionDialogDraftSet(
      { state },
      { draftSet: { opacity: 0.5, visible: false } },
    );
    const viewData = selectViewData({
      state,
      props: { itemType: "text" },
      constants: yaml.load(
        readFileSync(
          new URL(
            "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
      i18n: EN_I18N,
    });

    expect(
      viewData.conditionalOverrideDraftAttributeItems.map(
        ({ fieldName }) => fieldName,
      ),
    ).toEqual(["opacity", "visible"]);
    expect(viewData).toMatchObject({
      conditionLabel: "Condition",
      attributesLabel: "Attributes",
    });
    expect(viewData.conditionalOverrideConditionForm.fields.at(-1)).toEqual({
      type: "slot",
      slot: "conditional-override-attributes",
      label: "Attributes",
    });
    // The saved override keeps its attributes until the dialog's Save.
    expect(
      viewData.config.sections
        .flatMap((section) => section.items)
        .find((item) => item.type === "conditional-override-list")
        .items[1].attributeItems.map(({ fieldName }) => fieldName),
    ).toEqual(["opacity"]);
  });
});
