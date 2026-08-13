import { describe, expect, it, vi } from "vitest";
import {
  handleAssetStoreLink,
  handleFormAction,
  handleResourceSelectionKeyDown,
  handleResourceSelectionToggle,
  handleSelectionToggleAll,
} from "../../src/components/resource-import-dialog/resource-import-dialog.handlers.js";

const createDeps = () => {
  const plan = {
    planId: "plan-1",
    resources: [{ sourceId: "transform.source", name: "Transform" }],
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
        selectStep: vi.fn(() => "selection"),
        selectPlan: vi.fn(() => plan),
        selectReviewValues: vi.fn(() => ({})),
        openSourceStep: vi.fn(),
        saveReviewValues: vi.fn(),
        setResourceSelected: vi.fn(),
        setAllResourcesSelected: vi.fn(),
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

  it("imports the selected resources directly from the selection page", async () => {
    const { deps } = createDeps();
    const values = {
      resource_0_include: true,
      resource_0_name: "Renamed Transform",
      resource_0_description: "Updated description",
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

  it("imports only checked resources without opening item steps", async () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectStep.mockReturnValue("selection");
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
      resource_1_include: true,
      resource_1_name: "Second Transform",
      resource_1_description: "Second description",
    });
    const values = {};

    await handleFormAction(deps, {
      _event: {
        detail: { actionId: "import", values, valid: true },
      },
    });

    expect(deps.projectService.executeResourceImportPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedResourceIds: ["transform.second"],
        resourceNames: { "transform.second": "Second Transform" },
        resourceDescriptions: {
          "transform.second": "Second description",
        },
      }),
    );
  });

  it("toggles a resource choice from the selection card", () => {
    const { deps, plan } = createDeps();
    plan.resources.push({
      sourceId: "transform.second",
      name: "Second Transform",
    });
    deps.store.selectReviewValues.mockReturnValue({
      resource_1_include: false,
    });
    const card = {
      dataset: { resourceSourceId: "transform.second" },
      getAttribute: vi.fn(() => "true"),
    };

    handleResourceSelectionToggle(deps, {
      _event: {
        composedPath: vi.fn(() => [{}, card, {}]),
      },
    });

    expect(deps.store.setResourceSelected).toHaveBeenCalledWith({
      sourceId: "transform.second",
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("allows a required dependency to be deselected", () => {
    const { deps } = createDeps();
    deps.store.selectReviewValues.mockReturnValue({
      resource_0_include: false,
    });
    const card = {
      dataset: { resourceSourceId: "transform.source" },
      getAttribute: vi.fn(() => "true"),
    };

    handleResourceSelectionToggle(deps, {
      _event: {
        composedPath: vi.fn(() => [card, {}]),
      },
    });

    expect(deps.store.setResourceSelected).toHaveBeenCalledWith({
      sourceId: "transform.source",
      selected: false,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("toggles a resource choice with Enter or Space", () => {
    const { deps } = createDeps();
    const card = {
      dataset: { resourceSourceId: "transform.source" },
      getAttribute: vi.fn(() => "false"),
    };
    const enterEvent = {
      composedPath: vi.fn(() => [card, {}]),
      key: "Enter",
      preventDefault: vi.fn(),
    };
    const spaceEvent = {
      composedPath: vi.fn(() => [card, {}]),
      key: " ",
      preventDefault: vi.fn(),
    };

    handleResourceSelectionKeyDown(deps, { _event: enterEvent });
    handleResourceSelectionKeyDown(deps, { _event: spaceEvent });

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(spaceEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.store.setResourceSelected).toHaveBeenNthCalledWith(1, {
      sourceId: "transform.source",
      selected: true,
    });
    expect(deps.store.setResourceSelected).toHaveBeenNthCalledWith(2, {
      sourceId: "transform.source",
      selected: true,
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("ignores clicks outside a resource card", () => {
    const { deps } = createDeps();

    handleResourceSelectionToggle(deps, {
      _event: {
        composedPath: vi.fn(() => [{}, {}]),
      },
    });

    expect(deps.store.setResourceSelected).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
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
          actionId: "import",
          values: {},
          valid: true,
        },
      },
    });

    expect(
      deps.projectService.executeResourceImportPlan,
    ).not.toHaveBeenCalled();
    expect(deps.store.saveReviewValues).toHaveBeenCalledWith({
      values: {},
    });
    expect(deps.store.setError).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: "no_resources_selected" }),
      step: "selection",
    });
  });
});
