import { describe, expect, it } from "vitest";
import { selectForm as selectRenderedForm } from "../../node_modules/@rettangoli/ui/src/components/form/form.store.js";
import {
  closeImageSelector,
  confirmImageReplacement,
  createInitialState,
  openImageSelector,
  openItemStep,
  selectViewData,
  setAllResourcesSelected,
  setResourceSelected,
  setSelectedReplacementImage,
  setPlan,
  syncFromProps,
  useDefaultImage,
} from "../../src/components/resource-import-dialog/resource-import-dialog.store.js";

const createRepositoryState = () => ({
  transforms: {
    items: {
      folder: { id: "folder", type: "folder", name: "Folder" },
    },
    tree: [{ id: "folder" }],
  },
  images: {
    items: {
      imageFolder: {
        id: "imageFolder",
        type: "folder",
        name: "Images",
      },
      existing: {
        id: "existing",
        type: "image",
        name: "Existing Image",
      },
    },
    tree: [{ id: "imageFolder", children: [{ id: "existing" }] }],
  },
});

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
      primary: true,
    },
    {
      sourceId: "source.two",
      name: "Transform Two",
      description: "Second transform",
      previewSourceId: "file.transform-two",
      previewKind: "video",
    },
  ],
  images: [
    {
      sourceId: "image.one",
      name: "Package Image One",
      previewSourceId: "file.image-one",
      usedByResourceIds: ["source.one"],
    },
    {
      sourceId: "image.two",
      name: "Package Image Two",
      previewSourceId: "file.image-two",
      usedByResourceIds: ["source.two"],
    },
  ],
  warnings: [
    {
      code: "name_conflict",
      message: "A transform with this name already exists.",
    },
  ],
  unsupportedResourceTypes: [],
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
      placeholder: "https://example.com/import/package.json",
    });
    expect(view).toMatchObject({
      assetStoreLinkLabel: "Browse the Asset Store",
      assetStoreUrl: "https://routevn.com/en/creator/asset-store/",
    });
  });

  it("opens multi-resource packages on a visual selection page", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: { open: true, expectedResourceType: "transforms" },
        repositoryState: createRepositoryState(),
      },
    );
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

  it("customizes selected resources one by one and submits from the last item", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: { open: true, expectedResourceType: "transforms" },
        repositoryState: createRepositoryState(),
      },
    );
    setPlan({ state }, { plan: createMultiResourcePlan() });
    openItemStep({ state }, { resourceIndex: 0 });

    const firstView = selectViewData({ state, i18n: {} });
    expect(firstView.step).toBe("item");
    expect(firstView.form).toMatchObject({
      title: "Customize Transform One",
      description: "Item 1 of 2",
    });
    expect(firstView.currentResource).toMatchObject({
      sourceId: "source.one",
      previewSourceId: "file.transform-one",
    });
    expect(firstView.currentImages).toEqual([
      expect.objectContaining({
        sourceId: "image.one",
        imageIndex: 0,
        customized: false,
      }),
    ]);
    expect(firstView.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "resource-preview", type: "slot" }),
        expect.objectContaining({
          type: "row",
          fields: [
            expect.objectContaining({
              name: "resource_0_name",
              label: "Resource Name",
              type: "input-text",
            }),
            expect.objectContaining({
              name: "resource_0_description",
              label: "Resource Description",
              type: "input-textarea",
              rows: 3,
            }),
          ],
        }),
        expect.objectContaining({
          slot: "image-resources-header",
          type: "slot",
        }),
        expect.objectContaining({
          slot: "image-resources-list",
          type: "slot",
        }),
      ]),
    );
    expect(
      firstView.form.fields.some((field) => field.name === "image_0_mode"),
    ).toBe(false);
    expect(
      firstView.form.fields.find((field) =>
        field.fields?.some(
          (nestedField) => nestedField.name === "resourceDestinationMode",
        ),
      ),
    ).toMatchObject({ type: "row" });
    expect(
      firstView.form.fields.map(
        (field) => field.slot ?? field.name ?? field.fields?.[0]?.name,
      ),
    ).toEqual([
      "resource-preview",
      "resource_0_name",
      "resourceDestinationMode",
      "image-resources-header",
      "imageDestinationMode",
      "image-resources-list",
    ]);
    const firstRenderedForm = selectRenderedForm({
      state: { formValues: firstView.defaultValues },
      props: { form: firstView.form, context: firstView.formContext },
    });
    const firstRenderedFields = firstRenderedForm.fields.flatMap(
      (field) => field.fields ?? [field],
    );
    expect(
      firstRenderedFields.some((field) => field.name === "resourceParentId"),
    ).toBe(false);
    expect(
      firstRenderedFields.some((field) => field.name === "imageParentId"),
    ).toBe(false);
    expect(firstView.defaultValues).toMatchObject({
      resource_0_name: "Transform One",
      resource_0_description: "First transform",
      resourceDestinationMode: "new",
      resourceNewFolderName: "Imported Transforms",
      imageDestinationMode: "new",
      imageNewFolderName: "Imported Transforms",
    });
    const destinationModeFields = firstView.form.fields
      .flatMap((field) => field.fields ?? [field])
      .filter((field) => field.name?.endsWith("DestinationMode"));
    expect(destinationModeFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "resourceDestinationMode",
          options: [
            { label: "New Folder", value: "new" },
            { label: "Existing Folder", value: "existing" },
          ],
        }),
        expect.objectContaining({
          name: "imageDestinationMode",
          options: [
            { label: "New Folder", value: "new" },
            { label: "Existing Folder", value: "existing" },
          ],
        }),
      ]),
    );
    expect(
      destinationModeFields.find(
        (field) => field.name === "imageDestinationMode",
      ),
    ).not.toHaveProperty("description");
    expect(firstView.form.actions.buttons.at(-1)).toMatchObject({
      id: "next",
      label: "Next",
    });

    openItemStep(
      { state },
      {
        values: {
          resource_0_name: "Renamed Transform",
          resource_0_description: "Updated description",
          resourceDestinationMode: "new",
          resourceNewFolderName: "Custom Transforms",
          imageDestinationMode: "new",
          imageNewFolderName: "Custom Images",
        },
        resourceIndex: 1,
      },
    );
    const lastView = selectViewData({ state, i18n: {} });
    expect(lastView.form).toMatchObject({
      title: "Customize Transform Two",
      description: "Item 2 of 2",
    });
    expect(lastView.form.actions.buttons.at(-1)).toMatchObject({
      id: "import",
      label: "Submit All",
    });
    expect(lastView.formContext.resource_0_name).toBe("Renamed Transform");
    expect(lastView.formContext.resource_0_description).toBe(
      "Updated description",
    );
    expect(lastView.formContext).toMatchObject({
      resourceDestinationMode: "new",
      resourceNewFolderName: "Custom Transforms",
      imageDestinationMode: "new",
      imageNewFolderName: "Custom Images",
    });
    const resourceDestinationRow = lastView.form.fields.find((field) =>
      field.fields?.some(
        (nestedField) => nestedField.name === "resourceDestinationMode",
      ),
    );
    expect(resourceDestinationRow).toMatchObject({ type: "row" });
    expect(resourceDestinationRow.fields.map((field) => field.name)).toEqual([
      "resourceDestinationMode",
      "resourceParentId",
      "resourceNewFolderName",
    ]);
    const imageDestinationRow = lastView.form.fields.find((field) =>
      field.fields?.some(
        (nestedField) => nestedField.name === "imageDestinationMode",
      ),
    );
    expect(imageDestinationRow).toMatchObject({ type: "row" });
    expect(imageDestinationRow.fields.map((field) => field.name)).toEqual([
      "imageDestinationMode",
      "imageParentId",
      "imageNewFolderName",
    ]);

    const renderedForm = selectRenderedForm({
      state: { formValues: lastView.defaultValues },
      props: { form: lastView.form, context: lastView.formContext },
    });
    const renderedFields = renderedForm.fields.flatMap(
      (field) => field.fields ?? [field],
    );
    expect(
      renderedFields.some((field) => field.name === "resourceParentId"),
    ).toBe(false);
    expect(renderedFields.some((field) => field.name === "imageParentId")).toBe(
      false,
    );
    expect(
      renderedForm.fields
        .filter((field) => field.type === "row")
        .map((field) => field.fields.map((nestedField) => nestedField.name)),
    ).toEqual(
      expect.arrayContaining([
        ["resourceDestinationMode", "resourceNewFolderName"],
        ["imageDestinationMode", "imageNewFolderName"],
      ]),
    );
  });

  it("selects a replacement image and restores package defaults", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: { open: true, expectedResourceType: "transforms" },
        repositoryState: createRepositoryState(),
      },
    );
    setPlan({ state }, { plan: createMultiResourcePlan() });
    openItemStep({ state }, { resourceIndex: 0 });

    openImageSelector({ state }, { imageIndex: 0 });

    let view = selectViewData({ state, i18n: {} });
    expect(view.imageSelectorDialog).toEqual({
      open: true,
      imageIndex: 0,
      selectedImageId: undefined,
    });

    setSelectedReplacementImage({ state }, { imageId: "existing" });
    view = selectViewData({ state, i18n: {} });
    expect(view.currentImages[0]).toMatchObject({
      customized: false,
      replacementImageId: undefined,
    });
    expect(view.imageSelectorDialog).toMatchObject({
      open: true,
      selectedImageId: "existing",
    });

    confirmImageReplacement({ state });
    view = selectViewData({ state, i18n: {} });
    expect(view.currentImages[0]).toMatchObject({
      customized: true,
      replacementImageId: "existing",
    });
    expect(view.imageSelectorDialog.open).toBe(false);

    openImageSelector({ state }, { imageIndex: 0 });
    expect(
      selectViewData({ state, i18n: {} }).imageSelectorDialog,
    ).toMatchObject({
      open: true,
      selectedImageId: "existing",
    });
    setSelectedReplacementImage({ state }, { imageId: "another-image" });
    closeImageSelector({ state });
    view = selectViewData({ state, i18n: {} });
    expect(view.imageSelectorDialog.open).toBe(false);
    expect(view.currentImages[0].replacementImageId).toBe("existing");

    useDefaultImage({ state }, { imageIndex: 0 });
    view = selectViewData({ state, i18n: {} });
    expect(view.currentImages[0]).toMatchObject({
      customized: false,
      replacementImageId: undefined,
    });
  });

  it("skips selection for one resource and defaults to new destinations", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: { open: true, expectedResourceType: "animations" },
        repositoryState: {
          animations: { items: {}, tree: [] },
          images: { items: {}, tree: [] },
        },
      },
    );
    setPlan(
      { state },
      {
        plan: {
          planId: "plan-1",
          package: { name: "Starter Pack", version: "1.0.0" },
          resources: [
            {
              sourceId: "animation.source",
              name: "Animation",
              previewSourceId: "file.animation",
            },
          ],
          images: [],
          warnings: [],
          unsupportedResourceTypes: [],
        },
      },
    );

    const view = selectViewData({ state, i18n: {} });
    expect(view.step).toBe("item");
    expect(view.isSelectionStep).toBe(false);
    expect(view.currentResource.previewSourceId).toBe("file.animation");
    expect(view.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "package-summary", type: "slot" }),
        expect.objectContaining({ slot: "resource-preview", type: "slot" }),
      ]),
    );
    const destinationFields = view.form.fields.flatMap(
      (field) => field.fields ?? [field],
    );
    expect(
      destinationFields.find(
        (field) => field.name === "resourceDestinationMode",
      ).options,
    ).toEqual([{ label: "New Folder", value: "new" }]);
    expect(view.defaultValues).toMatchObject({
      resourceDestinationMode: "new",
      resourceNewFolderName: "Starter Pack",
    });
    const renderedForm = selectRenderedForm({
      state: { formValues: view.defaultValues },
      props: { form: view.form, context: view.formContext },
    });
    expect(
      renderedForm.fields
        .find((field) =>
          field.fields?.some(
            (nestedField) => nestedField.name === "resourceDestinationMode",
          ),
        )
        .fields.map((field) => field.name),
    ).toEqual(["resourceDestinationMode", "resourceNewFolderName"]);
    expect(view.form.actions.buttons.at(-1)).toMatchObject({
      id: "import",
      label: "Submit All",
    });
  });

  it("preserves package folders without asking for asset destinations", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: { open: true, expectedResourceType: "transforms" },
        repositoryState: createRepositoryState(),
      },
    );
    const plan = createMultiResourcePlan();
    plan.assetPackage = true;
    plan.images = [];
    plan.resources = plan.resources.map((resource, index) => ({
      ...resource,
      sourceId: `images:image.${index}`,
      resourceType: "images",
      type: "image",
    }));
    setPlan({ state }, { plan });
    openItemStep({ state }, { resourceIndex: 0 });

    const view = selectViewData({ state, i18n: {} });
    const fields = view.form.fields.flatMap((field) => field.fields ?? [field]);
    expect(
      fields.some((field) => field.name === "resourceDestinationMode"),
    ).toBe(false);
    expect(fields.some((field) => field.name === "imageDestinationMode")).toBe(
      false,
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "resource_0_name" }),
        expect.objectContaining({ name: "resource_0_description" }),
      ]),
    );
  });

  it("builds a read-only animation timeline with transition and mask tracks", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: {
          open: true,
          expectedResourceType: "animations",
          projectResolution: { width: 1280, height: 720 },
        },
        repositoryState: {
          animations: { items: {}, tree: [] },
          images: { items: {}, tree: [] },
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
          images: [],
          warnings: [],
          unsupportedResourceTypes: [],
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
      defaultValues: { x: 640, y: 360, Mask: 0 },
    });
    expect(
      view.animationTimeline.maskProperties.Mask.keyframes[0],
    ).toMatchObject({
      delay: 100,
      duration: 900,
      value: 1,
    });
  });
});
