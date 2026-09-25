import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { produce } from "immer";
import { createAndroidUpdater } from "../../src/deps/clients/android/updater.js";
import { createGlobalUIClient } from "../../src/deps/clients/globalUI.js";
import { EN_I18N } from "../support/i18n.js";

const uiSource = pathToFileURL(
  createRequire(import.meta.url).resolve("@rettangoli/ui"),
);
const { default: createGlobalUI } = await import(
  new URL("./deps/createGlobalUI.js", uiSource).href
);
const handlers = await import(
  new URL("./components/global-ui/global-ui.handlers.js", uiSource).href
);
const storeModule = await import(
  new URL("./components/global-ui/global-ui.store.js", uiSource).href
);

let cleanup;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const offeredPlayUrl =
  "https://play.google.com/store/apps/details?id=com.routevn.creator";
const available = {
  status: "updateAvailable",
  release: {
    version: "1.15.0",
    changelog: "Improved editing",
    installation: { type: "googlePlay", url: offeredPlayUrl, build: "10" },
  },
};
const releaseMessage = EN_I18N.appPage.updateAvailableMessage
  .replace("{version}", "1.15.0")
  .replace("{releaseNotes}", "Improved editing");

const setup = async ({ result = available } = {}) => {
  const dom = new JSDOM("<body></body>", { pretendToBeVisual: true });
  const { document } = dom.window;
  vi.stubGlobal("document", document);
  dom.window.customElements.define(
    "test-editor-form",
    class extends dom.window.HTMLElement {
      connectedCallback() {
        this.append(document.createElement("input"));
      }
      validate() {
        return { valid: true };
      }
      getValues() {
        return { name: this.querySelector("input").value };
      }
    },
  );

  let state = storeModule.createInitialState();
  const store = Object.fromEntries(
    Object.entries(storeModule).map(([name, fn]) => [
      name,
      (payload) => {
        if (name.startsWith("select")) return fn({ state }, payload);
        state = produce(state, (draft) => fn({ state: draft }, payload));
      },
    ]),
  );
  const refs = { componentDialogBodyHost: document.createElement("div") };
  document.body.append(refs.componentDialogBodyHost);
  let formKey;
  const render = () => {
    if (store.selectIsOpen() && store.selectUiType() === "formDialog") {
      const config = store.selectFormDialogConfig();
      if (formKey !== config.key) {
        refs.formDialog?.remove();
        refs.formDialog = document.createElement("input");
        document.body.append(refs.formDialog);
        formKey = config.key;
      }
    } else {
      refs.formDialog?.remove();
      delete refs.formDialog;
      formKey = undefined;
    }
  };
  const element = { transformedHandlers: {} };
  const rawUI = createGlobalUI(element);
  const uiDeps = { store, refs, render, globalUI: rawUI };
  for (const [name, handler] of Object.entries(handlers)) {
    element.transformedHandlers[name] = (payload) => handler(uiDeps, payload);
  }
  const globalUI = createGlobalUIClient({ globalUI: rawUI });
  const isForeground = vi.fn(() => true);
  const metadataClient = { check: vi.fn().mockResolvedValue(result) };
  const openUrl = vi.fn().mockResolvedValue(undefined);
  const updater = createAndroidUpdater({
    globalUI,
    distribution: "google-play",
    metadataClient,
    openUrl,
    isForeground,
    getCopy: () => EN_I18N.appPage,
    keyValueStore: new Map(),
  });
  cleanup = async () => {
    isForeground.mockReturnValue(false);
    await globalUI.closeAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.window.close();
  };

  const openEditor = async (type) => {
    const editorResult =
      type === "componentDialog"
        ? globalUI.showComponentDialog({
            title: "Create Image",
            component: "test-editor-form",
            actions: {
              buttons: [
                {
                  id: "create",
                  label: "Create",
                  role: "confirm",
                  validate: true,
                },
              ],
            },
          })
        : globalUI.showFormDialog({ form: { title: "Create Particle" } });
    const settled = vi.fn();
    void editorResult.then(settled, settled);
    await vi.waitFor(() =>
      expect(document.querySelector("input")).toBeTruthy(),
    );
    const input = document.querySelector("input");
    input.value = "Unsubmitted name";
    return {
      input,
      result: editorResult,
      settled,
      submit: () =>
        type === "componentDialog"
          ? handlers.handleComponentDialogAction(uiDeps, {
              _event: { currentTarget: { dataset: { actionIndex: "0" } } },
            })
          : handlers.handleFormAction(uiDeps, {
              _event: {
                detail: { valid: true, values: { name: input.value } },
              },
            }),
    };
  };
  return {
    globalUI,
    store,
    updater,
    metadataClient,
    openUrl,
    isForeground,
    openEditor,
    cancel: () => handlers.handleCancel(uiDeps),
  };
};
const allowPendingWork = () =>
  new Promise((resolve) => setTimeout(resolve, 10));

describe("Android API updates with real global dialog handlers", () => {
  it.each(["componentDialog", "formDialog"])(
    "preserves unsubmitted %s input until submission before prompting once",
    async (type) => {
      const { openEditor, store, cancel, updater, metadataClient } =
        await setup();
      const editor = await openEditor(type);
      const checking = updater.checkForUpdates(true);
      const duplicate = updater.checkForUpdates(true);
      await allowPendingWork();
      expect(editor.settled).not.toHaveBeenCalled();
      expect(editor.input.isConnected).toBe(true);
      expect(editor.input.value).toBe("Unsubmitted name");
      expect(store.selectUiType()).toBe(type);
      expect(metadataClient.check).toHaveBeenCalledOnce();

      await editor.submit();
      await expect(editor.result).resolves.toMatchObject({
        values: { name: "Unsubmitted name" },
      });
      await vi.waitFor(() =>
        expect(store.selectConfig().message).toBe(releaseMessage),
      );
      cancel();
      await Promise.all([checking, duplicate]);
      expect(store.selectIsOpen()).toBe(false);
    },
  );

  it("waits for an editing dialog opened by the first result handler", async () => {
    const { openEditor, updater, globalUI, store, cancel } = await setup();
    const editor = await openEditor("formDialog");
    const next = editor.result.then(async () => {
      await Promise.resolve();
      return globalUI.showFormDialog({ form: { title: "Next Step" } });
    });
    const nextSettled = vi.fn();
    void next.then(nextSettled);
    const checking = updater.checkForUpdates(true);
    await editor.submit();
    await allowPendingWork();
    expect(nextSettled).not.toHaveBeenCalled();
    expect(store.selectUiType()).toBe("formDialog");
    expect(store.selectFormDialogConfig().form.title).toBe("Next Step");
    await globalUI.closeAll();
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(releaseMessage),
    );
    cancel();
    await checking;
  });

  it("preserves a dialog opened while a manual API check is in flight", async () => {
    const { openEditor, metadataClient, updater, store, cancel } =
      await setup();
    let finishCheck;
    metadataClient.check.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCheck = resolve;
        }),
    );
    const checking = updater.checkForUpdates(false);
    const editor = await openEditor("componentDialog");
    finishCheck(available);
    await allowPendingWork();
    expect(editor.settled).not.toHaveBeenCalled();
    expect(editor.input.isConnected).toBe(true);
    await editor.submit();
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(releaseMessage),
    );
    cancel();
    await checking;
  });

  it("releases a deferred prompt after a component dialog reports an error", async () => {
    const { openEditor, updater, store, cancel } = await setup();
    const editor = await openEditor("componentDialog");
    const error = new Error("Could not read form values");
    editor.input.parentElement.getValues = () => {
      throw error;
    };
    const rejected = expect(editor.result).rejects.toBe(error);
    const checking = updater.checkForUpdates(true);
    await editor.submit();
    await rejected;
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(releaseMessage),
    );
    cancel();
    await checking;
  });

  it("does not show a deferred prompt after backgrounding, then offers it on the next check", async () => {
    const { openEditor, updater, store, isForeground, cancel, metadataClient } =
      await setup();
    const editor = await openEditor("formDialog");
    const checking = updater.checkForUpdates(true);
    isForeground.mockReturnValue(false);
    await editor.submit();
    await checking;
    expect(store.selectIsOpen()).toBe(false);
    isForeground.mockReturnValue(true);
    const nextCheck = updater.checkForUpdates(true);
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(releaseMessage),
    );
    expect(metadataClient.check).toHaveBeenCalledTimes(2);
    cancel();
    await nextCheck;
  });

  it("defers a manual API failure alert without cancelling an editor", async () => {
    const { openEditor, updater, metadataClient, store, cancel, openUrl } =
      await setup();
    metadataClient.check.mockRejectedValueOnce(new Error("Offline"));
    const editor = await openEditor("componentDialog");
    const checking = updater.checkForUpdates(false);
    await allowPendingWork();
    expect(editor.settled).not.toHaveBeenCalled();
    expect(editor.input.isConnected).toBe(true);
    await editor.submit();
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(
        EN_I18N.appPage.retrieveUpdateInfoFallback,
      ),
    );
    cancel();
    await checking;
    expect(openUrl).not.toHaveBeenCalled();
  });

  it.each([
    [
      { status: "noUpdate", reason: "noCompatibleRelease" },
      "noCompatibleUpdateMessage",
    ],
    [{ status: "unsupportedClient" }, "updateUnsupportedMessage"],
  ])("shows an explicit manual alert for %o", async (result, copyKey) => {
    const { updater, store, cancel, openUrl } = await setup({ result });
    const checking = updater.checkForUpdates(false);
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(EN_I18N.appPage[copyKey]),
    );
    cancel();
    await checking;
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("keeps automatic API failures quiet while an editor is open", async () => {
    const { openEditor, updater, metadataClient, store } = await setup();
    metadataClient.check.mockRejectedValueOnce(new Error("Offline"));
    const editor = await openEditor("formDialog");
    await updater.checkForUpdates(true);
    expect(store.selectUiType()).toBe("formDialog");
    expect(editor.settled).not.toHaveBeenCalled();
    await editor.submit();
    await allowPendingWork();
    expect(store.selectIsOpen()).toBe(false);
  });
});
