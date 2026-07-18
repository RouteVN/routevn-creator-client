import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handleConditionalOverrideAttributeFormAction,
  handleConditionalOverrideAttributeImageClick,
  handleConditionalOverrideContextMenu,
  handleImageSelectorSubmit,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
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

const createPayload = () => ({
  _event: {
    preventDefault: vi.fn(),
    clientX: 40,
    clientY: 60,
    currentTarget: { dataset: { index: "0" } },
  },
});

describe("layoutEditPanel conditional overrides", () => {
  it("uses a border-only card hover and a full-width add attribute button", () => {
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

    expect(conditionalBlock).toContain(
      "rtgl-view#conditionalOverrideItem${i}x${j}x${k}",
    );
    expect(conditionalBlock).toContain(
      "bgc=bg br=md bw=xs bc=bo h-bc=ac cur=context-menu",
    );
    expect(conditionalBlock).not.toContain("h-bgc=");
    expect(conditionalBlock).not.toContain("conditionalOverrideDelete");
    expect(conditionalBlock).toContain(
      "conditionalOverrideAddAttribute${i}x${j}x${k} data-index=${conditionalItem.index} pre=plus s=sm v=gh w=f",
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
      view.indexOf("rtgl-dialog#soundSelectorDialog"),
    );

    expect(imageSelectorDialog).toContain(
      "rtgl-button#confirmImageSelection variant=pr: ${selectButton}",
    );
    expect(imageSelectorDialog).not.toContain("cancelImageSelection");
  });

  it("saves the selected browser image as the conditional attribute", () => {
    const values = {
      conditionalOverrides: [
        {
          when: { target: "variables['enabled']", op: "eq", value: true },
          set: {},
        },
      ],
    };
    const store = {
      selectConditionalOverrideAttributeDialog: vi.fn(() => ({
        editingIndex: 0,
        selectedImageId: "image-selected",
      })),
      selectValues: vi.fn(() => values),
      updateValueProperty: vi.fn(({ name, value }) => {
        values[name] = value;
      }),
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

    expect(values.conditionalOverrides[0].set).toEqual({
      imageId: "image-selected",
    });
    expect(
      store.closeConditionalOverrideAttributeDialog,
    ).toHaveBeenCalledOnce();
  });
});
