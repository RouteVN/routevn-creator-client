import { describe, expect, it, vi } from "vitest";
import {
  handleFormAction,
  handleScreenBackgroundClick,
} from "../../src/components/platformDetailsCreateDialog/platformDetailsCreateDialog.handlers.js";
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
    selectAdaptiveIconFileId: vi.fn(() => "adaptive-1"),
    selectSplashIconFileId: vi.fn(() => "splash-1"),
    selectLoadingBackgroundFileId: vi.fn(() => "loading-1"),
    selectStartBackgroundFileId: vi.fn(() => undefined),
    selectProjectResolution: vi.fn(() => ({ width: 1920, height: 1080 })),
    setScreenBackgroundFileId: vi.fn(),
  },
  render: vi.fn(),
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

  it("saves a web platform with its screen backgrounds and fades", async () => {
    const deps = createDeps({ platform: "web" });

    await handleFormAction(
      deps,
      createSubmitPayload({
        applicationName: "Project One",
        applicationIdentifier: "project-one",
        loadingFadeDuration: 300,
        startFadeDuration: "",
      }),
    );

    expect(
      deps.projectService.createCurrentPlatformDetails,
    ).toHaveBeenCalledWith(
      "web",
      expect.objectContaining({
        loadingBackgroundFileId: "loading-1",
        startBackgroundFileId: undefined,
        loadingFadeDuration: 300,
        startFadeDuration: 0,
      }),
    );
  });

  it("picks a screen background in the project's shape and keeps the upload", async () => {
    const deps = createDeps({ platform: "web" });
    deps.appService.pickFiles = vi.fn(async () => ({
      uploadSucessful: true,
      uploadResult: { fileId: "start-1" },
    }));

    await handleScreenBackgroundClick(deps, { target: "start" });

    expect(deps.appService.pickFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        upload: true,
        validations: [
          { type: "image-aspect-ratio", width: 1920, height: 1080 },
        ],
      }),
    );
    expect(deps.store.setScreenBackgroundFileId).toHaveBeenCalledWith({
      target: "start",
      fileId: "start-1",
    });
  });

  it("alerts and keeps nothing when the background upload fails", async () => {
    const deps = createDeps({ platform: "web" });
    deps.appService.pickFiles = vi.fn(async () => ({ uploadSucessful: false }));

    await handleScreenBackgroundClick(deps, { target: "loading" });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.platformDetailsPage.failedUploadBackground,
      title: EN_I18N.platformDetailsPage.errorTitle,
    });
    expect(deps.store.setScreenBackgroundFileId).not.toHaveBeenCalled();
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

it("creates Android details using normalized colors", async () => {
  const deps = createDeps({ platform: "android", iconFileId: "icon-1" });
  await handleFormAction(
    deps,
    createSubmitPayload({
      applicationName: "Project One",
      applicationIdentifier: "com.example.project_one",
      iconBackgroundColor: "#aabbcc",
      splashBackgroundColor: "#112233",
    }),
  );
  expect(deps.projectService.createCurrentPlatformDetails).toHaveBeenCalledWith(
    "android",
    {
      applicationName: "Project One",
      applicationIdentifier: "com.example.project_one",
      iconFileId: "icon-1",
      adaptiveIconFileId: "adaptive-1",
      splashIconFileId: "splash-1",
      iconBackgroundColor: "#AABBCC",
      splashBackgroundColor: "#112233",
    },
  );
  expect(deps.dispatchEvent.mock.calls[0][0].detail.platform).toBe("android");
});

it("creates iOS details with the bundle identifier and icon", async () => {
  const deps = createDeps({ platform: "ios", iconFileId: "icon-1" });
  await handleFormAction(
    deps,
    createSubmitPayload({
      applicationName: "Project One",
      applicationIdentifier: " com.example.project-one ",
    }),
  );
  expect(deps.appService.showAlert).not.toHaveBeenCalled();
  expect(deps.projectService.createCurrentPlatformDetails).toHaveBeenCalledWith(
    "ios",
    {
      applicationName: "Project One",
      applicationIdentifier: "com.example.project-one",
      iconFileId: "icon-1",
    },
  );
  expect(deps.dispatchEvent.mock.calls[0][0].detail.platform).toBe("ios");
});

it("refuses an iOS bundle identifier with an underscore", async () => {
  const deps = createDeps({ platform: "ios", iconFileId: "icon-1" });
  await handleFormAction(
    deps,
    createSubmitPayload({
      applicationName: "Project One",
      applicationIdentifier: "com.example.project_one",
    }),
  );
  expect(
    deps.projectService.createCurrentPlatformDetails,
  ).not.toHaveBeenCalled();
  expect(deps.appService.showAlert).toHaveBeenCalledWith({
    message: EN_I18N.platformDetailsPage.macosApplicationIdentifierInvalid,
    title: EN_I18N.platformDetailsPage.warningTitle,
  });
});
