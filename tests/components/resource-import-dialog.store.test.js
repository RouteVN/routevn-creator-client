import { describe, expect, it } from "vitest";
import { selectForm as selectRenderedForm } from "../../node_modules/@rettangoli/ui/src/components/form/form.store.js";
import {
  closeImageSelector,
  confirmImageReplacement,
  createInitialState,
  openImageSelector,
  openItemStep,
  selectViewData,
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
  package: { name: "Pack", version: "1.0.0" },
  resources: [
    {
      sourceId: "source.one",
      name: "Transform One",
      description: "First transform",
      previewUrl: "https://example.com/transform-one.png",
      primary: true,
    },
    {
      sourceId: "source.two",
      name: "Transform Two",
      description: "Second transform",
      previewUrl: "https://example.com/transform-two.png",
      previewKind: "video",
    },
  ],
  images: [
    {
      sourceId: "image.one",
      name: "Package Image One",
      previewUrl: "https://example.com/package-image-one.png",
      usedByResourceIds: ["source.one"],
    },
    {
      sourceId: "image.two",
      name: "Package Image Two",
      previewUrl: "https://example.com/package-image-two.png",
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
    expect(
      view.form.fields.find((field) => field.name === "url"),
    ).toMatchObject({
      placeholder: "https://example.com/import/package.json",
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
          previewUrl: "https://example.com/transform-one.png",
          selected: true,
          selectionLabel: "Import Transform One",
        }),
        expect.objectContaining({
          selectionSlot: "resource-selection-1",
          previewUrl: "https://example.com/transform-two.png",
          previewKind: "video",
        }),
      ]),
    );
    expect(view.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slot: "package-summary", type: "slot" }),
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
    expect(view.warnings).toEqual([]);
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
      previewUrl: "https://example.com/transform-one.png",
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
          name: "resource_0_name",
          type: "input-text",
        }),
        expect.objectContaining({ slot: "image-resources", type: "slot" }),
      ]),
    );
    expect(
      firstView.form.fields.some((field) => field.name === "image_0_mode"),
    ).toBe(false);
    expect(
      firstView.form.fields.some(
        (field) => field.name === "resourceDestinationMode",
      ),
    ).toBe(false);
    expect(firstView.form.actions.buttons.at(-1)).toMatchObject({
      id: "next",
      label: "Next",
    });

    openItemStep(
      { state },
      {
        values: { resource_0_name: "Renamed Transform" },
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
      renderedFields.find((field) => field.name === "resourceParentId")
        ?.options,
    ).toEqual([{ label: "Folder", value: "folder" }]);
    expect(
      renderedFields.find((field) => field.name === "imageParentId")?.options,
    ).toEqual([{ label: "Images", value: "imageFolder" }]);
    expect(
      renderedForm.fields
        .filter((field) => field.type === "row")
        .map((field) => field.fields.map((nestedField) => nestedField.name)),
    ).toEqual(
      expect.arrayContaining([
        ["resourceDestinationMode", "resourceParentId"],
        ["imageDestinationMode", "imageParentId"],
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
          package: { name: "Starter Pack", version: "1.0.0" },
          resources: [
            {
              sourceId: "animation.source",
              name: "Animation",
              previewUrl: "https://example.com/animation.png",
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
    expect(view.currentResource.previewUrl).toBe(
      "https://example.com/animation.png",
    );
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
