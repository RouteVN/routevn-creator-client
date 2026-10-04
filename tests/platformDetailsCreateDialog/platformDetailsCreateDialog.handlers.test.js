import { describe, expect, it, vi } from "vitest";
import { handleFormAction } from "../../src/components/platformDetailsCreateDialog/platformDetailsCreateDialog.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = ({ platform = "web", iconFileId } = {}) => ({
  appService: { showAlert: vi.fn() },
  dispatchEvent: vi.fn(),
  i18n: EN_I18N,
  projectService: {
    createCurrentPlatformDetails: vi.fn(async (_platform, patch) => patch),
  },
  store: {
    selectPlatform: vi.fn(() => platform),
    selectIconFileId: vi.fn(() => iconFileId),
  },
});

const createSubmitPayload = (values) => ({
  _event: { detail: { actionId: "submit", values } },
});

describe("platformDetailsCreateDialog handlers", () => {
  it("creates the platform details and emits created", async () => {
    const deps = createDeps({ platform: "windows", iconFileId: "icon-1" });

    await handleFormAction(
      deps,
      createSubmitPayload({
        applicationName: " Project One ",
        applicationIdentifier: "com.example.project",
      }),
    );

    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).toHaveBeenCalledWith("windows", {
      applicationName: "Project One",
      iconFileId: "icon-1",
      applicationIdentifier: "com.example.project",
    });
    const event = deps.dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe("created");
    expect(event.detail.platform).toBe("windows");
  });

  it("alerts and does not create when the form is invalid", async () => {
    const deps = createDeps({ platform: "windows" });

    await handleFormAction(
      deps,
      createSubmitPayload({
        applicationName: "Project One",
        applicationIdentifier: "com.example.project",
      }),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.windowsIconRequired,
      title: EN_I18N.platformDetailsPage.warningTitle,
    });
    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("alerts and does not emit created when saving fails", async () => {
    const deps = createDeps();
    deps.projectService.createCurrentPlatformDetails.mockRejectedValue(
      new Error("failed"),
    );

    await handleFormAction(
      deps,
      createSubmitPayload({
        applicationName: "Project One",
        applicationIdentifier: "project-one",
      }),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.failedCreatePlatformMessage,
      title: EN_I18N.platformDetailsPage.errorTitle,
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });
});
