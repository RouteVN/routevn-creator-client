import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  ensureProjectFolder,
  reconnectProjectFolder,
} from "../../src/pages/projects/support/projectFolderSetupFlow.js";
import { selectProjectFolderSetupCopy } from "../../src/internal/ui/projectFolderSetupFlow.js";
import {
  handleCreateButtonClick,
  handleMobileActionMenuClickItem,
} from "../../src/pages/projects/projects.handlers.js";

const i18n = yaml.load(
  readFileSync(new URL("../../src/i18n/en.yaml", import.meta.url), "utf8"),
);
const copy = i18n.projectFolderSetupPage;
const candidate = {
  name: "RouteVN Projects",
  displayPath: "On My iPad/RouteVN Projects",
  uri: "routevn-folder://selected/folder-1",
};

const createDeps = ({ platform = "ios", configured = false, reason } = {}) => {
  const status = { configured, reason, deviceName: "iPad" };
  const appService = {
    getPlatform: vi.fn(() => platform),
    getProjectFolderSetup: vi.fn(() => status),
    showFormDialog: vi.fn(async () => ({ actionId: "choose" })),
    pickProjectFolderSetup: vi.fn(async () => candidate),
    confirmProjectFolderSetup: vi.fn(async () => {
      status.configured = true;
      status.reason = undefined;
      return status;
    }),
    loadAllProjects: vi.fn(async () => [{ id: "project-1" }]),
    showToast: vi.fn(),
  };
  const store = {
    setProjects: vi.fn(),
    openCreateDialog: vi.fn(),
    closeMobileActionMenu: vi.fn(),
  };
  return { appService, store, i18n, render: vi.fn() };
};

describe("iOS projects folder setup from the Projects page", () => {
  it.each([
    ["tauri", false],
    ["android", false],
    ["ios", true],
  ])("asks nothing on %s (folder saved: %s)", async (platform, configured) => {
    const deps = createDeps({ platform, configured });
    expect(await ensureProjectFolder(deps)).toBe(true);
    expect(deps.appService.showFormDialog).not.toHaveBeenCalled();
    expect(deps.appService.pickProjectFolderSetup).not.toHaveBeenCalled();
  });

  it("explains that the folder holds every project, then opens the picker", async () => {
    const deps = createDeps();
    expect(await ensureProjectFolder(deps)).toBe(true);
    expect(deps.appService.showFormDialog).toHaveBeenCalledWith({
      size: "sm",
      form: {
        title: "Set up your projects folder",
        description:
          "All your RouteVN projects are kept in one folder. Every project you create or import is saved there. Choose “On My iPad” or an existing projects folder.",
        fields: [],
        actions: {
          buttons: [{ id: "choose", label: "Choose Folder", variant: "pr" }],
        },
      },
    });
    expect(deps.appService.pickProjectFolderSetup).toHaveBeenCalledWith({
      title: copy.pickerTitle,
    });
    expect(deps.appService.confirmProjectFolderSetup).toHaveBeenCalledWith({
      uri: candidate.uri,
    });
    // Projects already in the chosen folder are listed.
    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [{ id: "project-1" }],
    });
  });

  it("opens the create dialog only after the folder is saved", async () => {
    const deps = createDeps();
    await handleCreateButtonClick(deps);
    expect(deps.appService.confirmProjectFolderSetup).toHaveBeenCalledOnce();
    expect(deps.store.openCreateDialog).toHaveBeenCalledOnce();

    await handleCreateButtonClick(deps);
    expect(deps.appService.showFormDialog).toHaveBeenCalledOnce();
    expect(deps.store.openCreateDialog).toHaveBeenCalledTimes(2);
  });

  it("asks from the mobile Create menu as well", async () => {
    const deps = createDeps();
    deps.appService.showFormDialog.mockResolvedValue(null);
    await handleMobileActionMenuClickItem(deps, {
      _event: { detail: { item: { value: "create-project" } } },
    });
    expect(deps.store.closeMobileActionMenu).toHaveBeenCalledOnce();
    expect(deps.appService.showFormDialog).toHaveBeenCalledOnce();
    expect(deps.store.openCreateDialog).not.toHaveBeenCalled();
  });

  it("stops when the dialog is dismissed or the picker is cancelled", async () => {
    const deps = createDeps();
    deps.appService.showFormDialog.mockResolvedValueOnce(null);
    await handleCreateButtonClick(deps);
    expect(deps.appService.pickProjectFolderSetup).not.toHaveBeenCalled();

    deps.appService.pickProjectFolderSetup.mockResolvedValueOnce(undefined);
    await handleCreateButtonClick(deps);
    expect(deps.appService.confirmProjectFolderSetup).not.toHaveBeenCalled();
    expect(deps.store.openCreateDialog).not.toHaveBeenCalled();
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });

  it.each([
    [
      "appFolder",
      "This folder belongs to an app. Choose a separate folder under On My iPad.",
    ],
    [undefined, copy.pickError],
  ])("reports a rejected folder (%s) and stops", async (code, message) => {
    const deps = createDeps();
    const error = new Error("native");
    error.code = code;
    deps.appService.pickProjectFolderSetup.mockRejectedValue(error);
    expect(await ensureProjectFolder(deps)).toBe(false);
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      title: copy.errorTitle,
      message,
      status: "error",
    });
    expect(deps.appService.confirmProjectFolderSetup).not.toHaveBeenCalled();
  });

  it("reports a folder that could not be saved and stops", async () => {
    const deps = createDeps();
    deps.appService.confirmProjectFolderSetup.mockRejectedValue(
      new Error("native"),
    );
    await handleCreateButtonClick(deps);
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      title: copy.errorTitle,
      message: copy.confirmError,
      status: "error",
    });
    expect(deps.store.openCreateDialog).not.toHaveBeenCalled();
  });

  it("asks for a saved folder that cannot be opened as soon as Projects opens", async () => {
    const deps = createDeps({ reason: "reconnect" });
    await reconnectProjectFolder(deps);
    expect(deps.appService.showFormDialog).toHaveBeenCalledWith({
      size: "sm",
      form: {
        title: "Set up your projects folder",
        description:
          "Your saved folder is unavailable. Select it again to restore access. Choose your existing projects folder under “On My iPad”.",
        fields: [],
        actions: {
          buttons: [{ id: "choose", label: "Choose Folder", variant: "pr" }],
        },
      },
    });
    expect(deps.store.setProjects).toHaveBeenCalledWith({
      projects: [{ id: "project-1" }],
    });
    // The create dialog is not opened: the user only opened the app.
    expect(deps.store.openCreateDialog).not.toHaveBeenCalled();
  });

  it.each([
    ["ios", false, undefined],
    ["ios", true, undefined],
    ["android", false, undefined],
  ])(
    "does not ask when Projects opens on %s (folder saved: %s)",
    async (platform, configured, reason) => {
      const deps = createDeps({ platform, configured, reason });
      await reconnectProjectFolder(deps);
      expect(deps.appService.showFormDialog).not.toHaveBeenCalled();
    },
  );

  it("reports an app that cannot set up folders without opening the dialog", async () => {
    const deps = createDeps({ reason: "unavailable" });
    expect(await ensureProjectFolder(deps)).toBe(false);
    expect(deps.appService.showFormDialog).not.toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      title: copy.errorTitle,
      message: copy.unavailableError,
      status: "error",
    });
  });

  it.each([
    ["iPhone", "Na moim iPhonie"],
    ["iPad", "Na moim iPadzie"],
  ])(
    "names the %s Files location in the catalog's own words",
    (deviceName, location) => {
      const messages = yaml.load(
        readFileSync(
          new URL("../../src/i18n/pl.yaml", import.meta.url),
          "utf8",
        ),
      );
      expect(
        selectProjectFolderSetupCopy(messages, deviceName).description,
      ).toBe(`Wybierz „${location}” lub istniejący folder projektów.`);
    },
  );

  it.each(["en", "ja", "zh-hans", "pl"])(
    "uses the native iPad name in %s instructions and errors",
    (locale) => {
      const messages = yaml.load(
        readFileSync(
          new URL(`../../src/i18n/${locale}.yaml`, import.meta.url),
          "utf8",
        ),
      );
      const localized = selectProjectFolderSetupCopy(messages, "iPad");
      for (const key of [
        "description",
        "openDescription",
        "appFolderError",
        "localFolderError",
      ]) {
        expect(localized[key]).toContain("iPad");
        expect(localized[key]).not.toContain("iPhone");
        expect(localized[key]).not.toContain("{location}");
      }
    },
  );
});
