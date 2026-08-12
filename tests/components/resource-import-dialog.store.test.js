import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openItemStep,
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
      name: "Transform One",
      description: "First transform",
      previewSourceId: "file.transform-one",
    },
    {
      sourceId: "source.two",
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
        expect.objectContaining({
          slot: "resource-selection-0",
          type: "slot",
        }),
        expect.objectContaining({
          slot: "resource-selection-1",
          type: "slot",
        }),
      ]),
    );
    expect(view.form.fields.some((field) => field.type === "checkbox")).toBe(
      false,
    );
    expect(
      view.form.fields.some((field) => field.name === "resource_0_name"),
    ).toBe(false);
    expect(view.form.actions.buttons.at(-1)).toMatchObject({
      id: "select-continue",
      label: "Continue",
    });
    expect(view).toMatchObject({
      allResourcesSelected: true,
      selectionToggleAllLabel: "Deselect All",
    });
    expect(view.warnings).toEqual([]);

    setResourceSelected({ state }, { resourceIndex: 0, selected: false });
    expect(selectViewData({ state, i18n: {} }).resources[0]).toMatchObject({
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
      selected: true,
      selectionLocked: true,
      selectionStatus: "Required",
    });
    setResourceSelected({ state }, { resourceIndex: 0, selected: false });
    expect(state.reviewValues.resource_0_include).toBe(true);

    setResourceSelected({ state }, { resourceIndex: 1, selected: false });
    setResourceSelected({ state }, { resourceIndex: 0, selected: false });
    expect(state.reviewValues).toMatchObject({
      resource_0_include: false,
      resource_1_include: false,
    });
  });

  it("customizes selected resources one by one and submits from the last item", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    setPlan({ state }, { plan: createMultiResourcePlan() });
    openItemStep({ state }, { resourceIndex: 0 });

    const firstView = selectViewData({ state, i18n: {} });
    expect(firstView.form).toMatchObject({
      title: "Customize Transform One",
      description: "Item 1 of 2",
    });
    expect(firstView.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "resource-preview", type: "slot" }),
        expect.objectContaining({
          type: "row",
          fields: [
            expect.objectContaining({ name: "resource_0_name" }),
            expect.objectContaining({ name: "resource_0_description" }),
          ],
        }),
      ]),
    );
    expect(firstView.form.actions.buttons.at(-1).id).toBe("next");

    openItemStep(
      { state },
      {
        values: {
          resource_0_name: "Renamed Transform",
          resource_0_description: "Updated description",
        },
        resourceIndex: 1,
      },
    );
    const lastView = selectViewData({ state, i18n: {} });
    expect(lastView.form.actions.buttons.at(-1).id).toBe("import");
    expect(lastView.formContext).toMatchObject({
      resource_0_name: "Renamed Transform",
      resource_0_description: "Updated description",
    });
  });

  it("opens a one-resource package directly on its item page", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { open: true } });
    const plan = createMultiResourcePlan();
    plan.resources = [plan.resources[0]];
    setPlan({ state }, { plan });

    const view = selectViewData({ state, i18n: {} });
    const fields = view.form.fields.flatMap((field) => field.fields ?? [field]);
    expect(view.step).toBe("item");
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "resource_0_name" }),
        expect.objectContaining({ name: "resource_0_description" }),
      ]),
    );
    expect(
      fields.some((field) => field.name?.includes("Destination")),
    ).toBe(false);
  });

  it("builds a read-only animation timeline with transition and mask tracks", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: {
          open: true,
          projectResolution: { width: 1280, height: 720 },
        },
      },
    );
    setPlan(
      { state },
      {
        plan: {
          package: { name: "Starter Pack", version: "1.0.0" },
          resources: [
            {
              sourceId: "animation.source",
              type: "animation",
              name: "Transition",
              data: {
                animation: {
                  type: "transition",
                  prev: {
                    tween: {
                      alpha: {
                        initialValue: 1,
                        keyframes: [{ duration: 400, value: 0 }],
                      },
                    },
                  },
                  mask: {
                    kind: "single",
                    delay: 100,
                    progress: {
                      initialValue: 0,
                      keyframes: [{ duration: 900, value: 1 }],
                    },
                  },
                },
              },
            },
          ],
          warnings: [],
        },
      },
    );

    const view = selectViewData({ state, i18n: {} });
    expect(view.form.fields).toContainEqual({
      type: "slot",
      slot: "animation-timeline-preview",
    });
    expect(view.animationTimeline).toMatchObject({
      isTransition: true,
      hasPreviousProperties: true,
      hasNextProperties: false,
      hasMaskProperties: true,
      timelineDuration: 1000,
    });
  });
});
