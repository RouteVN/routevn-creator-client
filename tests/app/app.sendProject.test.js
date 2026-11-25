import { describe, expect, it, vi } from "vitest";
import {
  handleHelpFloatingButtonClick,
  handleSendProjectDialogClose,
  handleSendProjectDialogSubmit,
} from "../../src/pages/app/app.handlers.js";
import * as appStore from "../../src/pages/app/app.store.js";
import { createSendProgressView } from "../../src/pages/app/support/sendProjectToSupport.js";
import { formatFileSize } from "../../src/internal/files.js";
import { SupportUploadError } from "../../src/deps/services/shared/supportUploadService.js";
import { AR_I18N, EN_I18N, FR_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const COPY = EN_I18N.sendProjectDialog;
const DELETE_AFTER = Date.UTC(2026, 11, 26, 12);
const PROJECTS = [
  { id: "ProjectOne01", name: "Project One", projectPath: "/projects/one" },
  { id: "ProjectTwo02", name: "Project Two", projectPath: "/projects/two" },
];

// The app shell on a page, with the desktop app service by default. The
// progress dialog and alerts are recorded.
const createApp = ({
  route = "/project/images",
  payload = { p: "ProjectTwo02" },
  canSendProject = true,
  projects = PROJECTS,
  send = async () => ({ deleteAfter: DELETE_AFTER }),
  uiConfig = { id: "normal", inputMode: "pointer" },
} = {}) => {
  const state = appStore.createInitialState();
  appStore.setUiConfig({ state }, { uiConfig });
  appStore.setCurrentRoute({ state }, { route, payload });
  const store = {};
  Object.entries(appStore).forEach(([name, fn]) => {
    if (name !== "createInitialState" && typeof fn === "function") {
      store[name] = (input) => fn({ state, i18n: EN_I18N }, input);
    }
  });
  const progress = { updates: [], closed: false };
  const progressDialog = {
    update: vi.fn((view) => progress.updates.push(view)),
    close: vi.fn(() => {
      progress.closed = true;
    }),
    waitForPaint: async () => {},
  };
  const appService = {
    getDocumentDirection: () => "ltr",
    openUrl: vi.fn(),
    canEmbedYouTube: () => true,
    canSendProjectToSupport: () => canSendProject,
    loadAllProjects: vi.fn(async () => projects),
    showDropdownMenu: vi.fn(),
    showAlert: vi.fn(),
    showProgressDialog: vi.fn((options) => {
      progress.options = options;
      return progressDialog;
    }),
    sendProjectToSupport: vi.fn(send),
    cancelSendingProjectToSupport: vi.fn(async () => {}),
  };
  const deps = { store, i18n: EN_I18N, render: vi.fn(), appService };
  const chooseFromHelp = (key) => {
    appService.showDropdownMenu.mockImplementationOnce(async ({ items }) => ({
      item: items.find((item) => item.key === key),
    }));
    return handleHelpFloatingButtonClick(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({ top: 820, right: 1416, left: 1360 }),
        },
      },
    });
  };
  const submit = (detail) =>
    handleSendProjectDialogSubmit(deps, { _event: { detail } });
  return {
    state,
    deps,
    appService,
    progress,
    chooseFromHelp,
    submit,
    viewData: () => store.selectViewData(),
    html: () =>
      renderViewYaml("src/pages/app/app.view.yaml", store.selectViewData()),
  };
};

const menuItems = async (app) => {
  app.appService.showDropdownMenu.mockResolvedValueOnce(undefined);
  await app.chooseFromHelp("none");
  return app.appService.showDropdownMenu.mock.calls[0][0].items;
};

describe("Send Project to Support", () => {
  it("is offered in the help menu after chat support where the app can pack a project", async () => {
    const desktop = createApp();
    await desktop.chooseFromHelp("none");
    const [{ items }] = desktop.appService.showDropdownMenu.mock.calls[0];
    expect(
      items.map(({ key, label, icon }) => [key, label, icon]).slice(-2),
    ).toEqual([
      ["chat", "Chat Support", "chat"],
      ["sendProject", "Send Project to Support", "upload"],
    ]);

    const web = createApp({ canSendProject: false });
    expect((await menuItems(web)).map(({ key }) => key)).not.toContain(
      "sendProject",
    );
  });

  it("is offered in the touch layout too", async () => {
    const touch = createApp({ uiConfig: { id: "touch", inputMode: "touch" } });
    expect((await menuItems(touch)).map(({ key }) => key)).toContain(
      "sendProject",
    );
  });

  it("opens the dialog with every project and the open one chosen", async () => {
    const app = createApp();
    await app.chooseFromHelp("sendProject");

    expect(app.viewData().sendProjectDialog).toEqual({
      projects: PROJECTS,
      projectId: "ProjectTwo02",
    });
    const html = app.html();
    expect(html).toContain("<rvn-send-project-dialog");
    expect(html).toContain('id="sendProjectDialog"');

    handleSendProjectDialogClose(app.deps);
    expect(app.html()).not.toContain("<rvn-send-project-dialog");
  });

  it("chooses no project first from the projects page", async () => {
    const app = createApp({ route: "/projects", payload: {} });
    await app.chooseFromHelp("sendProject");
    expect(app.viewData().sendProjectDialog.projectId).toBeUndefined();
  });

  it("says there is nothing to send when there is no project", async () => {
    const app = createApp({ projects: [] });
    await app.chooseFromHelp("sendProject");
    expect(app.viewData().sendProjectDialog).toBeUndefined();
    expect(app.appService.showAlert).toHaveBeenCalledWith({
      message: COPY.noProjectsMessage,
    });
  });

  it("closes when the page changes", async () => {
    const app = createApp();
    await app.chooseFromHelp("sendProject");
    appStore.setCurrentRoute(
      { state: app.state },
      { route: "/project/sounds" },
    );
    expect(app.viewData().sendProjectDialog).toBeUndefined();
  });

  it("sends the chosen project with progress, then says when support's copy is deleted", async () => {
    const app = createApp({
      send: async ({ onProgress }) => {
        onProgress({ stage: "packing", current: 50, total: 100 });
        onProgress({ stage: "checking", current: 100, total: 100 });
        onProgress({ stage: "uploading", current: 1048576, total: 2097152 });
        onProgress({ stage: "finishing" });
        return { deleteAfter: DELETE_AFTER };
      },
    });
    await app.chooseFromHelp("sendProject");

    await app.submit({ code: "k7q-m4x", projectId: "ProjectOne01" });

    expect(app.viewData().sendProjectDialog).toBeUndefined();
    expect(app.appService.sendProjectToSupport).toHaveBeenCalledWith({
      projectPath: "/projects/one",
      code: "k7q-m4x",
      onProgress: expect.any(Function),
    });
    expect(app.progress.options).toMatchObject({
      title: "Sending Project",
      message: COPY.progressMessage,
      status: "Preparing the project… 0%",
      cancel: { label: "Cancel" },
    });
    expect(app.progress.updates.map(({ status }) => status)).toEqual([
      "Preparing the project… 25%",
      "Preparing the project… 100%",
      "Uploading…\n1 MB of 2 MB (50%)",
      "Finishing up…",
    ]);
    expect(app.progress.updates.at(-1).cancel).toEqual({
      label: "Cancel",
      disabled: true,
    });
    expect(app.progress.closed).toBe(true);
    const [alert] = app.appService.showAlert.mock.calls.at(-1);
    expect(alert.title).toBe("Project Sent");
    expect(alert.message).toContain("Support can now open the project.");
    expect(alert.message).toContain(
      new Date(DELETE_AFTER).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("cancels from the progress dialog without an alert", async () => {
    let rejectSend;
    const app = createApp({
      send: () =>
        new Promise((_resolve, reject) => {
          rejectSend = reject;
        }),
    });
    await app.chooseFromHelp("sendProject");
    const sending = app.submit({ code: "K7QM4X", projectId: "ProjectOne01" });
    await vi.waitFor(() => expect(rejectSend).toBeDefined());

    await app.progress.options.cancel.onCancel();
    expect(app.appService.cancelSendingProjectToSupport).toHaveBeenCalled();
    expect(app.progress.updates.at(-1)).toEqual({
      cancel: { label: "Cancelling…", disabled: true },
    });
    rejectSend(new SupportUploadError("cancelled"));
    await sending;

    expect(app.progress.closed).toBe(true);
    expect(app.appService.showAlert).not.toHaveBeenCalled();
  });

  it.each([
    [
      "codeUnknown",
      "No support code matches K7QM4X. Check the code and try again.",
    ],
    ["codeExpired", COPY.codeExpiredMessage],
    ["codeUsed", COPY.codeUsedMessage],
    ["rateLimited", COPY.rateLimitedMessage],
    [
      "tooLarge",
      "This project is larger than 2 GB, too large to send this way. Ask support for another way to send it.",
    ],
    ["tooManyAttempts", COPY.tooManyAttemptsMessage],
    ["unavailable", COPY.unavailableMessage],
  ])(
    "says what to do next when the send ends with %s",
    async (code, message) => {
      const app = createApp({
        send: async () => {
          throw new SupportUploadError(code);
        },
      });
      await app.submit({ code: "k7q m4x", projectId: "ProjectOne01" });
      expect(app.appService.showAlert).toHaveBeenCalledWith({
        title: "Project Not Sent",
        message,
      });
    },
  );

  it("adds the technical details when the send fails unexpectedly", async () => {
    const app = createApp({
      send: async () => {
        throw new SupportUploadError("failed", {
          cause: "uploadFailed: HTTP 403 Forbidden: SignatureDoesNotMatch",
        });
      },
    });
    await app.submit({ code: "K7QM4X", projectId: "ProjectOne01" });
    const [{ message }] = app.appService.showAlert.mock.calls[0];
    expect(
      message.startsWith("The project could not be sent.\n\nDetails:\n"),
    ).toBe(true);
    expect(message).toContain("SignatureDoesNotMatch");
  });
});

describe("send progress view", () => {
  it("keeps the numbers in right-to-left copy", () => {
    const view = createSendProgressView({
      copy: AR_I18N.sendProjectDialog,
      dateTime: AR_I18N.dateTime,
      event: { stage: "uploading", current: 1048576, total: 2097152 },
    });
    expect(view.status).toBe(
      AR_I18N.sendProjectDialog.uploadingStatus
        .replace("{sent}", formatFileSize(1048576, AR_I18N.dateTime))
        .replace("{total}", formatFileSize(2097152, AR_I18N.dateTime))
        .replace("{percent}", "50"),
    );
    expect(view.status).not.toMatch(/[{}]/);
  });

  it("formats sizes and percentages for the app language", () => {
    const view = createSendProgressView({
      copy: FR_I18N.sendProjectDialog,
      dateTime: FR_I18N.dateTime,
      event: { stage: "uploading", current: 1048576, total: 2097152 },
    });
    expect(view.status).toBe(
      FR_I18N.sendProjectDialog.uploadingStatus
        .replace("{sent}", formatFileSize(1048576, FR_I18N.dateTime))
        .replace("{total}", formatFileSize(2097152, FR_I18N.dateTime))
        .replace("{percent}", "50"),
    );
    expect(view.status).toContain("Mo sur");
    expect(view.progress).toEqual({ current: 1048576, total: 2097152 });
  });
});
