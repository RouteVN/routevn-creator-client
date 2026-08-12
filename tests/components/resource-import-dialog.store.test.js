import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAllResourcesSelected,
  setResourceSelected,
  setPlan,
  syncFromProps,
} from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";

const createMultiResourcePlan = () => ({
  planId: "plan-1",
  package: {
    name: "Pack",
    version: "1.0.0",
    defaultFolderName: "Imported Transforms",
  },
  resources: [
    {
      sourceId: "source.one",
      resourceType: "transforms",
      type: "transform",
      name: "Transform One",
      description: "First transform",
      previewSourceId: "file.transform-one",
    },
    {
      sourceId: "source.two",
      resourceType: "transforms",
      type: "transform",
      name: "Transform Two",
      description: "Second transform",
      previewSourceId: "file.transform-two",
      previewKind: "video",
    },
  ],
  warnings: [
    {
      code: "name_conflict",
      message: "A transform with this name already exists.",
    },
  ],
});

describe("resource-import-dialog.store", () => {
  it("provides a concrete placeholder for the source URL input", () => {
    const state = createInitialState();
    const view = selectViewData({ state, i18n: {} });
    expect(view.form.fields[0]).toEqual({
      type: "slot",
      slot: "source-description",
    });
    expect(
      view.form.fields.find((field) => field.name === "url"),
    ).toMatchObject({
      placeholder: "https://example.com/import/asset-package.json",
    });
    expect(view).toMatchObject({
      assetStoreLinkLabel: "Browse the Asset Store",
      assetStoreUrl: "https://routevn.com/en/creator/asset-store/",
    });
  });

  it("opens multi-resource packages on a visual selection page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan: createMultiResourcePlan() });

    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("selection");
    expect(view.isSelectionStep).toBe(true);
    expect(view.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selectionSlot: "resource-selection-0",
          previewSourceId: "file.transform-one",
          typeLabel: "Transform",
          selected: true,
          selectionLabel: "Import Transform One",
          selectionBorderColor: "pr",
          selectionHoverBorderColor: "pr",
          selectionStatus: "Selected",
          selectionStatusColor: "pr",
        }),
        expect.objectContaining({
          selectionSlot: "resource-selection-1",
          previewSourceId: "file.transform-two",
          previewKind: "video",
        }),
      ]),
    );
    expect(view.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "package-summary", type: "slot" }),
        expect.objectContaining({ slot: "selection-controls", type: "slot" }),
        {
          type: "row",
          fields: [
            { slot: "resource-selection-0", type: "slot" },
            { slot: "resource-selection-1", type: "slot" },
          ],
        },
      ]),
    );
    expect(view.form.fields.some((field) => field.type === "checkbox")).toBe(
      false,
    );
    expect(
      view.form.fields.some((field) => field.name === "resource_0_name"),
    ).toBe(false);
    expect(view.form.actions.buttons.at(-1)).toMatchObject({
      id: "import",
      label: "Import",
    });
    expect(view).toMatchObject({
      allResourcesSelected: true,
      selectionToggleAllLabel: "Deselect All",
    });
    expect(view.warnings).toEqual([]);

    setResourceSelected({ state }, { resourceIndex: 0, selected: false });
    const deselectedView = selectViewData({ state, i18n: {} });
    expect(deselectedView.resources.map(({ sourceId }) => sourceId)).toEqual([
      "source.one",
      "source.two",
    ]);
    expect(
      deselectedView.resources.find(
        ({ sourceId }) => sourceId === "source.one",
      ),
    ).toMatchObject({
      selected: false,
      selectionBorderColor: "bo",
      selectionHoverBorderColor: "ac",
      selectionStatus: "Not selected",
      selectionStatusColor: "mu-fg",
    });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      allResourcesSelected: false,
      selectionToggleAllLabel: "Select All",
    });

    setAllResourcesSelected({ state }, { selected: true });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      allResourcesSelected: true,
      selectionToggleAllLabel: "Deselect All",
    });
  });

  it("keeps selected dependencies visible and locked", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.resources[1].dependencySourceIds = [plan.resources[0].sourceId];
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan });

    expect(selectViewData({ state, i18n: {} }).resources[0]).toMatchObject({
      sourceId: "source.two",
      selected: true,
      selectionLocked: false,
    });
    expect(selectViewData({ state, i18n: {} }).resources.at(-1)).toMatchObject({
      sourceId: "source.one",
      selected: true,
      selectionLocked: true,
      selectionStatus: "Required",
    });
    expect(
      selectViewData({ state, i18n: {} })
        .form.fields.flatMap(({ fields = [] }) => fields)
        .filter(({ slot }) => slot?.startsWith("resource-selection-"))
        .map(({ slot }) => slot),
    ).toEqual(["resource-selection-1", "resource-selection-0"]);
    setResourceSelected({ state }, { resourceIndex: 0, selected: false });
    expect(state.reviewValues.resource_0_include).toBe(true);

    setResourceSelected({ state }, { resourceIndex: 1, selected: false });
    setResourceSelected({ state }, { resourceIndex: 0, selected: false });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: false,
      resource_1_include: false,
    });
    expect(
      selectViewData({ state, i18n: {} }).resources.map(
        ({ sourceId }) => sourceId,
      ),
    ).toEqual(["source.two", "source.one"]);
  });

  it("opens a one-resource package on the selection page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    const plan = createMultiResourcePlan();
    plan.resources = [plan.resources[0]];
    setPlan({ state }, { plan });

    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("selection");
    expect(view.form.fields.at(-1)).toEqual({
      type: "row",
      fields: [
        { type: "slot", slot: "resource-selection-0" },
        { type: "slot", slot: "resource-selection-spacer-0" },
      ],
    });
    expect(view.form.actions.buttons.at(-1).id).toBe("import");
  });
});
