import { describe, expect, it, vi } from "vitest";
import {
  handleAssetStoreLink,
  handleConfirmImageReplacement,
  handleFormAction,
  handleImageCustomize,
  handleImageSelectorClose,
  handleImageUseDefault,
  handleReplacementImageSelected,
  handleResourceSelectionKeyDown,
  handleResourceSelectionToggle,
  handleSelectionToggleAll,
} from "../../src/components/resource-import-dialog/resource-import-dialog.handlers.js";

const createDeps = () => {
  const plan = {
    planId: "plan-1",
    resources: [{ sourceId: "transform.source", name: "Transform" }],
    images: [
      {
        sourceId: "image.source",
        usedByResourceIds: ["transform.source"],
      },
    ],
  };
  return {
    plan,
    deps: {
      i18n: {},
      render: vi.fn(),
      dispatchEvent: vi.fn(),
      appService: {
        openUrl: vi.fn(),
      },
      store: {
        selectStep: vi.fn(() => "item"),
        selectPlan: vi.fn(() => plan),
        selectReviewValues: vi.fn(() => ({})),
        selectCurrentResourceIndex: vi.fn(() => 0),
        openItemStep: vi.fn(),
        openSelectionStep: vi.fn(),
        openSourceStep: vi.fn(),
        saveReviewValues: vi.fn(),
        setResourceSelected: vi.fn(),
        setAllResourcesSelected: vi.fn(),
        openImageSelector: vi.fn(),
        closeImageSelector: vi.fn(),
        setSelectedReplacementImage: vi.fn(),
        confirmImageReplacement: vi.fn(),
        useDefaultImage: vi.fn(),
        startExecution: vi.fn(),
        setProgress: vi.fn(),
        setError: vi.fn(),
      },
      projectService: {
        validateResourceImportPlan: vi.fn(() => ({ valid: true })),
        executeResourceImportPlan: vi.fn(async () => ({ valid: true })),
      },
    },
  };
};

describe("resource-import-dialog.handlers", () => {
  it("opens the asset store through the app URL service", () => {
    const { deps } = createDeps();
    const url = "http://localhost:3003/en/creator/asset-store/";
    const preventDefault = vi.fn();

    handleAssetStoreLink(deps, {
      _event: {
        preventDefault,
        currentTarget: {
          getAttribute: vi.fn(() => url),
        },
      },
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.appService.openUrl).toHaveBeenCalledWith(url);
  });

  it("maps the accumulated wizard values into validation and execution", async () => {
    const { deps } = createDeps();
    const values = {
      resource_0_include: true,
      resource_0_name: "Renamed Transform",
      resource_0_description: "Updated description",
      resourceDestinationMode: "new",
      resourceNewFolderName: "Imported Transforms",
      image_0_mode: "import",
      imageDestinationMode: "new",
      imageNewFolderName: "Imported Images",
    };

    await handleFormAction(deps, {
      _event: {
        detail: { actionId: "import", values, valid: true },
      },
    });

    const expectedChoices = {
      selectedResourceIds: ["transform.source"],
      resourceNames: { "transform.source": "Renamed Transform" },
      resourceDescriptions: {
        "transform.source": "Updated description",
      },
      resourceChoices: { "image.source": { mode: "import" } },
      resourceDestination: {
        mode: "create",
        name: "Imported Transforms",
      },
      imageDestination: { mode: "create", name: "Imported Images" },
    };
    expect(deps.projectService.validateResourceImportPlan).toHaveBeenCalledWith(
      { planId: "plan-1", ...expectedChoices },
    );
    expect(deps.projectService.executeResourceImportPlan).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "plan-1", ...expectedChoices }),
    );
    expect(deps.store.startExecution).toHaveBeenCalledWith(
      expect.objectContaining({ values }),
    );
    expect(deps.store.saveReviewValues).toHaveBeenCalledWith({ values });
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("opens the first checked resource from the selection page", async () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectStep.mockReturnValue("selection");
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
      resource_1_include: true,
    });
    const values = {};

    await handleFormAction(deps, {
      _event: {
        detail: { actionId: "select-continue", values, valid: true },
      },
    });

    expect(deps.store.openItemStep).toHaveBeenCalledWith({
      values,
      resourceIndex: 1,
    });
  });

  it("toggles a resource choice from the selection card", () => {
    const { deps } = createDeps();

    handleResourceSelectionToggle(deps, {
      _event: {
        currentTarget: {
          dataset: { resourceIndex: "1" },
          getAttribute: vi.fn(() => "true"),
        },
      },
    });

    expect(deps.store.setResourceSelected).toHaveBeenCalledWith({
      resourceIndex: 1,
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("toggles a resource choice with Enter or Space", () => {
    const { deps } = createDeps();
    const currentTarget = {
      dataset: { resourceIndex: "0" },
      getAttribute: vi.fn(() => "false"),
    };
    const enterEvent = {
      currentTarget,
      key: "Enter",
      preventDefault: vi.fn(),
    };
    const spaceEvent = {
      currentTarget,
      key: " ",
      preventDefault: vi.fn(),
    };

    handleResourceSelectionKeyDown(deps, { _event: enterEvent });
    handleResourceSelectionKeyDown(deps, { _event: spaceEvent });

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(spaceEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.store.setResourceSelected).toHaveBeenNthCalledWith(1, {
      resourceIndex: 0,
      selected: true,
    });
    expect(deps.store.setResourceSelected).toHaveBeenNthCalledWith(2, {
      resourceIndex: 0,
      selected: true,
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("toggles all resource choices from the selection control", () => {
    const { deps } = createDeps();

    handleSelectionToggleAll(deps, {
      _event: {
        currentTarget: {
          dataset: { allSelected: "true" },
        },
      },
    });

    expect(deps.store.setAllResourcesSelected).toHaveBeenCalledWith({
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("stages and confirms a replacement image, then restores defaults", () => {
    const { deps } = createDeps();
    const currentTarget = { dataset: { imageIndex: "2" } };

    handleImageCustomize(deps, { _event: { currentTarget } });
    handleReplacementImageSelected(deps, {
      _event: { detail: { imageId: "project-image" } },
    });
    handleConfirmImageReplacement(deps);
    handleImageSelectorClose(deps);
    handleImageUseDefault(deps, { _event: { currentTarget } });

    expect(deps.store.openImageSelector).toHaveBeenCalledWith({
      imageIndex: 2,
    });
    expect(deps.store.setSelectedReplacementImage).toHaveBeenCalledWith({
      imageId: "project-image",
    });
    expect(deps.store.confirmImageReplacement).toHaveBeenCalledTimes(1);
    expect(deps.store.closeImageSelector).toHaveBeenCalledTimes(1);
    expect(deps.store.useDefaultImage).toHaveBeenCalledWith({ imageIndex: 2 });
    expect(deps.render).toHaveBeenCalledTimes(4);
  });

  it("preserves the current item values when moving to the next item", async () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: true,
      resource_1_include: true,
    });
    const values = {
      resource_0_name: "Updated Transform",
      resource_0_description: "Updated description",
    };

    await handleFormAction(deps, {
      _event: {
        detail: { actionId: "next", values, valid: true },
      },
    });

    expect(deps.store.openItemStep).toHaveBeenCalledWith({
      values,
      resourceIndex: 1,
    });
  });

  it("keeps the selection page open when nothing is checked", async () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectStep.mockReturnValue("selection");
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
      resource_1_include: false,
    });

    await handleFormAction(deps, {
      _event: {
        detail: {
          actionId: "select-continue",
          values: {},
          valid: true,
        },
      },
    });

    expect(deps.store.openItemStep).not.toHaveBeenCalled();
    expect(deps.store.saveReviewValues).toHaveBeenCalledWith({
      values: {},
    });
    expect(deps.store.setError).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: "no_resources_selected" }),
      step: "selection",
    });
  });
});
