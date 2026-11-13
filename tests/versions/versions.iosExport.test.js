import { describe, expect, it, vi } from "vitest";
import {
  handleDownloadIosApplicationClick,
  handleIosExportFormAction,
} from "../../src/pages/versions/versions.handlers.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";
import { EN_I18N } from "../support/i18n.js";

const COPY = EN_I18N.versionsPage;
const TEAMS = [
  { id: "COMPANY123", name: "Studio One", kind: "Company", free: false },
  { id: "PERSONAL12", name: "A Person", kind: "Personal Team", free: true },
];
const IPAD = {
  id: "00008110-0001",
  name: "iPad",
  model: "iPad mini",
  osVersion: "27.0",
  available: true,
};

const createDeps = ({ teamId = "", requirements, devices } = {}) => {
  const version = { id: "version-1", name: "1.2.3", actionIndex: 3 };
  const progressDialog = {
    close: vi.fn(),
    update: vi.fn(),
    waitForPaint: vi.fn(async () => {}),
  };
  let exportConfirmation;
  let exportConfirmationPending = false;
  let iosExportOptions = { teams: [], devices: [] };
  return {
    appService: {
      getPlatform: vi.fn(() => "tauri"),
      getAppVersion: vi.fn(() => "1.0.0"),
      getFileDisplayPath: vi.fn((path) => path),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      showDialog: vi.fn(async () => true),
      showProgressDialog: vi.fn(() => progressDialog),
      openUrl: vi.fn(async () => {}),
    },
    projectService: {
      getCurrentPlatformDetails: vi.fn(async () => ({
        applicationName: "Project One",
        applicationIdentifier: "com.example.project-one",
        iconFileId: "icon-1",
        teamId,
      })),
      getFileContent: vi.fn(async () => new Uint8Array([1])),
      getCurrentProjectInfo: vi.fn(async () => ({
        namespace: "project-one",
        name: "Project One",
        iconFileId: "icon-1",
      })),
      loadRepositoryState: vi.fn(async () =>
        structuredClone(initialProjectData),
      ),
      getIosExportRequirements: vi.fn(
        async () =>
          requirements ?? {
            xcode: { status: "ready", version: "27.2", minimumVersion: "26.0" },
            teams: TEAMS,
          },
      ),
      listIosDevices: vi.fn(async () => devices ?? [IPAD]),
      getIosExportAvailability: vi.fn(async () => ({ available: true })),
      promptIosApplicationPath: vi.fn(async () => "/exports/Project One.ipa"),
      updateCurrentPlatformDetails: vi.fn(async () => ({})),
      exportIosApplication: vi.fn(
        async (_data, _files, outputPath, { installDeviceId }) => ({
          outputPath,
          uploaded: false,
          installed: installDeviceId !== undefined,
          launched: installDeviceId !== undefined,
        }),
      ),
    },
    i18n: EN_I18N,
    refs: { iosExportForm: { reset: vi.fn(), setValues: vi.fn() } },
    store: {
      selectVersion: vi.fn((id) => (id === version.id ? version : undefined)),
      setSelectedItemId: vi.fn(),
      closeDropdownMenu: vi.fn(),
      openExportConfirmation: vi.fn((confirmation) => {
        exportConfirmation = confirmation;
      }),
      selectExportConfirmation: vi.fn(() => exportConfirmation),
      closeExportConfirmation: vi.fn(),
      setExportConfirmationPending: vi.fn(({ pending }) => {
        exportConfirmationPending = pending;
      }),
      selectExportConfirmationPending: vi.fn(() => exportConfirmationPending),
      setIosExportOptions: vi.fn((options) => {
        iosExportOptions = options;
      }),
      selectIosExportOptions: vi.fn(() => iosExportOptions),
    },
    progressDialog,
    render: vi.fn(),
  };
};

const openIosExport = (deps) =>
  handleDownloadIosApplicationClick(deps, {
    _event: {
      stopPropagation: vi.fn(),
      currentTarget: { dataset: { versionId: "version-1" } },
    },
  });

const submitIosExport = (deps, values = {}) =>
  handleIosExportFormAction(deps, {
    _event: {
      detail: {
        actionId: "submit",
        values: {
          version: "1.2.3",
          buildNumber: "7",
          teamId: "COMPANY123",
          distribution: "appStore",
          upload: false,
          deviceId: "none",
          ...values,
        },
      },
    },
  });

describe("iOS export", () => {
  it("opens the dialog with Xcode's teams and the connected devices", async () => {
    const deps = createDeps({
      devices: [IPAD, { ...IPAD, id: "phone", available: false }],
    });
    await openIosExport(deps);
    expect(deps.store.setIosExportOptions).toHaveBeenCalledWith({
      teams: TEAMS,
      devices: [IPAD],
    });
    expect(deps.store.openExportConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        exportType: "ios-application",
        platform: "ios",
      }),
    );
    expect(deps.refs.iosExportForm.setValues).toHaveBeenCalledWith({
      values: {
        version: "1.2.3",
        buildNumber: "",
        teamId: "COMPANY123",
        distribution: "appStore",
        upload: false,
      },
    });
  });

  it("opens without devices when listing them fails", async () => {
    const deps = createDeps();
    deps.projectService.listIosDevices.mockRejectedValue(
      new Error("devicectl failed"),
    );
    await openIosExport(deps);
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: COPY.iosDevicesFailed,
    });
    expect(deps.store.setIosExportOptions).toHaveBeenCalledWith({
      teams: TEAMS,
      devices: [],
    });
    expect(deps.store.openExportConfirmation).toHaveBeenCalled();
  });

  it("selects the team the game used last, and Development for a Personal Team", async () => {
    const deps = createDeps({ teamId: "PERSONAL12" });
    await openIosExport(deps);
    expect(deps.refs.iosExportForm.setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({
        teamId: "PERSONAL12",
        distribution: "development",
      }),
    });
  });

  it("ignores export clicks while the checks run", async () => {
    const deps = createDeps();
    let finishChecks;
    deps.projectService.getIosExportRequirements.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishChecks = () =>
            resolve({
              xcode: {
                status: "ready",
                version: "27.2",
                minimumVersion: "26.0",
              },
              teams: TEAMS,
            });
        }),
    );
    const first = openIosExport(deps);
    await vi.waitFor(() => expect(finishChecks).toBeDefined());
    await openIosExport(deps);
    finishChecks();
    await first;
    expect(deps.projectService.getIosExportRequirements).toHaveBeenCalledTimes(
      1,
    );
    expect(deps.store.openExportConfirmation).toHaveBeenCalledTimes(1);
    // The next click works once the dialog has opened.
    await openIosExport(deps);
    expect(deps.store.openExportConfirmation).toHaveBeenCalledTimes(2);
  });

  it("offers to get Xcode when it is not installed", async () => {
    const deps = createDeps({
      requirements: {
        xcode: { status: "notInstalled", minimumVersion: "26.0" },
        teams: [],
      },
    });
    await openIosExport(deps);
    expect(deps.appService.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: COPY.iosXcodeRequiredTitle,
        confirmText: COPY.iosGetXcodeButton,
        message: expect.stringContaining("Xcode 26.0"),
      }),
    );
    expect(deps.appService.openUrl).toHaveBeenCalledWith(
      "https://apps.apple.com/app/xcode/id497799835",
    );
    expect(deps.store.openExportConfirmation).not.toHaveBeenCalled();
  });

  it("explains Xcode setup steps it cannot open", async () => {
    const deps = createDeps({
      requirements: {
        xcode: { status: "iosPlatformMissing", minimumVersion: "26.0" },
        teams: TEAMS,
      },
    });
    await openIosExport(deps);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: COPY.iosXcodeRequiredTitle,
      message: COPY.iosPlatformMissingMessage,
    });
    expect(deps.store.openExportConfirmation).not.toHaveBeenCalled();
  });

  it("asks for the team ID when Xcode lists no teams", async () => {
    const deps = createDeps({
      requirements: {
        xcode: { status: "ready", version: "27.2", minimumVersion: "26.0" },
        teams: [],
      },
    });
    await openIosExport(deps);
    expect(deps.store.openExportConfirmation).toHaveBeenCalled();
    expect(deps.refs.iosExportForm.setValues).toHaveBeenCalledWith({
      values: expect.objectContaining({ teamId: "", distribution: "appStore" }),
    });
    await submitIosExport(deps, { teamId: "team" });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosTeamIdInvalid,
      title: COPY.warningTitle,
    });
    expect(deps.projectService.exportIosApplication).not.toHaveBeenCalled();
    await submitIosExport(deps, { teamId: " abcde12345 " });
    expect(
      deps.projectService.exportIosApplication.mock.calls[0][3].teamId,
    ).toBe("ABCDE12345");
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("ios", { teamId: "ABCDE12345" });
  });

  it("exports and uploads an App Store build, and remembers the team", async () => {
    const deps = createDeps();
    deps.projectService.exportIosApplication.mockImplementation(
      async (_data, _files, outputPath) => ({ outputPath, uploaded: true }),
    );
    await openIosExport(deps);
    await submitIosExport(deps, { upload: true });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("ios", { teamId: "COMPANY123" });
    // The team is remembered once the export has signed with it.
    expect(
      deps.projectService.updateCurrentPlatformDetails.mock
        .invocationCallOrder[0],
    ).toBeGreaterThan(
      deps.projectService.exportIosApplication.mock.invocationCallOrder[0],
    );
    expect(deps.projectService.exportIosApplication).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      "/exports/Project One.ipa",
      {
        installDeviceId: undefined,
        applicationName: "Project One",
        bundleIdentifier: "com.example.project-one",
        version: "1.2.3",
        buildNumber: "7",
        iconFileId: "icon-1",
        teamId: "COMPANY123",
        distribution: "appStore",
        upload: true,
      },
      { onProgress: expect.any(Function) },
    );
    const steps = deps.appService.showProgressDialog.mock.calls[0][0].steps;
    expect(steps.map(({ label }) => label)).toEqual([
      COPY.iosPrepareProjectStep,
      COPY.iosPackGameStep,
      COPY.iosBuildAppStep,
      COPY.iosSignAppStep,
      COPY.iosSaveAppStep,
      COPY.iosUploadAppStep,
    ]);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosUploadedMessage.replace(
        "{path}",
        "/exports/Project One.ipa",
      ),
      title: COPY.exportCompletedTitle,
    });
  });

  it("installs a development build on the chosen device without saving it", async () => {
    const deps = createDeps({ teamId: "COMPANY123" });
    await openIosExport(deps);
    await submitIosExport(deps, {
      distribution: "development",
      upload: true,
      deviceId: IPAD.id,
    });
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
    expect(deps.projectService.promptIosApplicationPath).not.toHaveBeenCalled();
    const [, , outputPath, metadata] =
      deps.projectService.exportIosApplication.mock.calls[0];
    expect(outputPath).toBeUndefined();
    expect(metadata).toEqual(
      expect.objectContaining({
        installDeviceId: IPAD.id,
        distribution: "development",
        upload: false,
      }),
    );
    const steps = deps.appService.showProgressDialog.mock.calls[0][0].steps;
    expect(steps.map(({ label }) => label)).toEqual([
      COPY.iosPrepareProjectStep,
      COPY.iosPackGameStep,
      COPY.iosBuildAppStep,
      COPY.iosSignAppStep,
      COPY.iosInstallAppStep,
    ]);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosInstalledMessage.replace("{device}", "iPad"),
      title: COPY.exportCompletedTitle,
    });
  });

  it("asks to open the app when the device is locked", async () => {
    const deps = createDeps({ teamId: "COMPANY123" });
    deps.projectService.exportIosApplication.mockResolvedValue({
      uploaded: false,
      installed: true,
      launched: false,
    });
    await openIosExport(deps);
    await submitIosExport(deps, {
      distribution: "development",
      deviceId: IPAD.id,
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosInstalledNotOpenedMessage.replace("{device}", "iPad"),
      title: COPY.exportCompletedTitle,
    });
  });

  it("explains a failed install without claiming a saved IPA", async () => {
    const deps = createDeps({ teamId: "COMPANY123" });
    deps.projectService.exportIosApplication.mockRejectedValue({
      code: "device-not-registered",
      message: "The device is not in the provisioning profile.",
      ipaSaved: false,
    });
    await openIosExport(deps);
    await submitIosExport(deps, {
      distribution: "development",
      deviceId: IPAD.id,
    });
    const { message, title } = deps.appService.showAlert.mock.calls[0][0];
    expect(title).toBe(COPY.errorTitle);
    expect(message).toContain(COPY.iosDeviceNotRegistered);
    expect(message).not.toContain(COPY.iosIpaSavedNotice.split("{path}")[0]);
  });

  it("exports a development build without installing when no device is chosen", async () => {
    const deps = createDeps({ teamId: "COMPANY123" });
    await openIosExport(deps);
    await submitIosExport(deps, {
      distribution: "development",
      deviceId: undefined,
    });
    expect(deps.projectService.promptIosApplicationPath).toHaveBeenCalled();
    expect(
      deps.projectService.exportIosApplication.mock.calls[0][3].installDeviceId,
    ).toBeUndefined();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosDevelopmentExportCompletedMessage.replace(
        "{path}",
        "/exports/Project One.ipa",
      ),
      title: COPY.exportCompletedTitle,
    });
  });

  it("refuses an App Store build for a Personal Team", async () => {
    const deps = createDeps();
    await openIosExport(deps);
    await submitIosExport(deps, { teamId: "PERSONAL12" });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosPersonalTeamAppStore,
      title: COPY.warningTitle,
    });
    expect(deps.projectService.exportIosApplication).not.toHaveBeenCalled();
  });

  it("checks the version and build number", async () => {
    const deps = createDeps();
    await openIosExport(deps);
    await submitIosExport(deps, { buildNumber: "1234567890" });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosExportBuildNumberInvalid,
      title: COPY.warningTitle,
    });
    await submitIosExport(deps, { version: "1.2" });
    expect(deps.appService.showAlert).toHaveBeenLastCalledWith({
      message: COPY.iosExportVersionInvalid,
      title: COPY.warningTitle,
    });
    expect(deps.projectService.exportIosApplication).not.toHaveBeenCalled();
  });

  it("explains a failed upload and says where the IPA was saved", async () => {
    const deps = createDeps();
    deps.projectService.exportIosApplication.mockRejectedValue({
      code: "app-record-missing",
      message: "App record with bundle identifier not found.",
      ipaSaved: true,
    });
    await openIosExport(deps);
    await submitIosExport(deps, { upload: true });
    expect(deps.progressDialog.close).toHaveBeenCalled();
    const { message, title } = deps.appService.showAlert.mock.calls[0][0];
    expect(title).toBe(COPY.errorTitle);
    expect(message).toContain(COPY.iosAppRecordMissing);
    expect(message).toContain(
      COPY.iosIpaSavedNotice.replace("{path}", "/exports/Project One.ipa"),
    );
    expect(message).toContain("App record with bundle identifier not found.");
    // The build was signed, so its team is remembered.
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).toHaveBeenCalledWith("ios", { teamId: "COMPANY123" });
  });

  it("keeps Xcode's error lines whole", async () => {
    const deps = createDeps();
    const xcodeLines = [
      "error: exportArchive No profiles for 'com.example.project-one' were found",
      `  ${"Xcode couldn't find any iOS App Store provisioning profiles. ".repeat(6)}`,
      "** EXPORT FAILED **",
    ].join("\n");
    deps.projectService.exportIosApplication.mockRejectedValue({
      code: "signing-failed",
      message: xcodeLines,
      ipaSaved: false,
    });
    await openIosExport(deps);
    await submitIosExport(deps);
    const { message } = deps.appService.showAlert.mock.calls[0][0];
    expect(message).toBe(
      `${COPY.iosSigningFailed}\n\n${COPY.errorDetailsLabel}\n${xcodeLines.trim()}`,
    );
  });

  it("tells when the team cannot be remembered, after a finished export", async () => {
    const deps = createDeps();
    deps.projectService.updateCurrentPlatformDetails.mockRejectedValue(
      new Error("write failed"),
    );
    await openIosExport(deps);
    await submitIosExport(deps);
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: COPY.iosTeamSaveFailed,
    });
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.iosAppStoreExportCompletedMessage.replace(
        "{path}",
        "/exports/Project One.ipa",
      ),
      title: COPY.exportCompletedTitle,
    });
  });

  it("does not claim an IPA when signing failed", async () => {
    const deps = createDeps();
    deps.projectService.exportIosApplication.mockRejectedValue({
      code: "team-not-signed-in",
      message: "No Account for Team.",
      ipaSaved: false,
    });
    await openIosExport(deps);
    await submitIosExport(deps);
    const { message } = deps.appService.showAlert.mock.calls[0][0];
    expect(message).toContain(COPY.iosTeamNotSignedIn);
    expect(message).not.toContain("/exports/Project One.ipa");
    // A team that did not sign is not remembered.
    expect(
      deps.projectService.updateCurrentPlatformDetails,
    ).not.toHaveBeenCalled();
  });
});
