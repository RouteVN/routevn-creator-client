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
  reviewSections: [
    {
      resourceType: "transforms",
      items: [
        {
          kind: "folder",
          sourceId: "transforms:folder-one",
          name: "Folder One",
          depth: 0,
        },
        { kind: "resources", sourceIds: ["source.one"] },
        {
          kind: "folder",
          sourceId: "transforms:folder-two",
          name: "Folder Two",
          depth: 0,
        },
        { kind: "resources", sourceIds: ["source.two"] },
      ],
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
          previewSourceId: "file.transform-one",
          planResourceIndex: 0,
          typeLabel: "Transform",
          selected: true,
          selectionLabel: "Import Transform One",
          selectionBorderColor: "pr",
          selectionHoverBorderColor: "pr",
          selectionStatus: "Selected",
          selectionStatusColor: "pr",
        }),
        expect.objectContaining({
          previewSourceId: "file.transform-two",
          planResourceIndex: 1,
          previewKind: "video",
        }),
      ]),
    );
    expect(view.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "package-summary", type: "slot" }),
        expect.objectContaining({ slot: "selection-controls", type: "slot" }),
        { slot: "resource-selection-grid", type: "slot" },
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
    expect(view.resourceSections[0]).toMatchObject({
      resourceType: "transforms",
      typeLabel: "Transform",
      groups: [
        { kind: "folder", name: "Folder One", indent: 0 },
        { kind: "resources", resources: [{ sourceId: "source.one" }] },
        { kind: "folder", name: "Folder Two", indent: 0 },
        { kind: "resources", resources: [{ sourceId: "source.two" }] },
      ],
    });

    setResourceSelected({ state }, { sourceId: "source.one", selected: false });
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

  it("deselects dependents when a required dependency is deselected", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.resources[1].dependencySourceIds = [plan.resources[0].sourceId];
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan });

    expect(selectViewData({ state, i18n: {} }).resources[0]).toMatchObject({
      sourceId: "source.one",
      selected: true,
      required: true,
      selectionStatus: "Required",
    });
    expect(selectViewData({ state, i18n: {} }).resources.at(-1)).toMatchObject({
      sourceId: "source.two",
      selected: true,
      required: false,
    });
    setResourceSelected({ state }, { sourceId: "source.one", selected: false });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: false,
      resource_1_include: false,
    });

    setResourceSelected({ state }, { sourceId: "source.two", selected: true });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: true,
      resource_1_include: true,
    });
    setResourceSelected({ state }, { sourceId: "source.two", selected: false });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: true,
      resource_1_include: false,
    });
    expect(selectViewData({ state, i18n: {} }).resources[0]).toMatchObject({
      sourceId: "source.one",
      selected: true,
      required: false,
      selectionStatus: "Selected",
    });
    expect(
      selectViewData({ state, i18n: {} }).resources.map(
        ({ sourceId }) => sourceId,
      ),
    ).toEqual(["source.one", "source.two"]);
  });

  it("follows the manifest resource-type section order", () => {
    const state = createInitialState();
    const plan = createMultiResourcePlan();
    plan.resources.push({
      sourceId: "image.one",
      resourceType: "images",
      type: "image",
      name: "Image One",
    });
    plan.reviewSections.unshift({
      resourceType: "images",
      items: [
        { kind: "folder", name: "Images Folder", depth: 0 },
        { kind: "resources", sourceIds: ["image.one"] },
      ],
    });
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan });

    const view = selectViewData({ state, i18n: {} });
    expect(
      view.resourceSections.map(({ resourceType }) => resourceType),
    ).toEqual(["images", "transforms"]);
    expect(view.resourceSections[0]).toMatchObject({
      typeLabel: "Image",
      groups: [
        { kind: "folder", name: "Images Folder" },
        { kind: "resources", resources: [{ sourceId: "image.one" }] },
      ],
    });
  });

  it("opens a one-resource package on the selection page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    const plan = createMultiResourcePlan();
    plan.resources = [plan.resources[0]];
    plan.reviewSections[0].items = plan.reviewSections[0].items.slice(0, 2);
    setPlan({ state }, { plan });

    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("selection");
    expect(view.form.fields.at(-1)).toEqual({
      type: "slot",
      slot: "resource-selection-grid",
    });
    expect(view.form.actions.buttons.at(-1).id).toBe("import");
  });
});
