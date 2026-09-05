import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { produce } from "immer";
import { createAndroidUpdater } from "../../src/deps/clients/android/updater.js";
import { createGlobalUIClient } from "../../src/deps/clients/globalUI.js";
import { createBrowserEventsClient } from "../../src/deps/clients/browserEvents.js";
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

const setup = async ({ status = "downloaded" } = {}) => {
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
  // Only rendering is simplified. Show/close/submit behavior and promises use
  // the installed Rettangoli implementation, including its replacement logic.
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
  const bridge = vi.fn(async (method) => {
    if (method === "getAppUpdateSupport") return { status: "supported" };
    if (method === "checkAppUpdate") return { status, versionCode: 7 };
    if (method === "startAppUpdate") return { status: "downloading" };
    throw new Error(`Unexpected bridge method: ${method}`);
  });
  const updater = await createAndroidUpdater({
    globalUI,
    bridge,
    isForeground,
    beforeInstall: vi.fn(),
    getCopy: () => EN_I18N.appPage,
    keyValueStore: new Map(),
    browserEventsClient: createBrowserEventsClient({
      windowTarget: dom.window,
    }),
  });
  cleanup = async () => {
    isForeground.mockReturnValue(false);
    await globalUI.closeAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.window.close();
  };

  const openEditor = async (type) => {
    const result =
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
    void result.then(settled, settled);
    await vi.waitFor(() =>
      expect(document.querySelector("input")).toBeTruthy(),
    );
    const input = document.querySelector("input");
    input.value = "Unsubmitted name";
    return {
      input,
      result,
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
    bridge,
    updater,
    isForeground,
    openEditor,
    cancel: () => handlers.handleCancel(uiDeps),
    emit: (detail = { status: "downloaded", versionCode: 7 }) =>
      dom.window.dispatchEvent(
        new dom.window.CustomEvent("routevn:android-update", { detail }),
      ),
  };
};

const allowPendingWork = () =>
  new Promise((resolve) => setTimeout(resolve, 10));

describe("Android updates with real global dialog handlers", () => {
  it.each(["componentDialog", "formDialog"])(
    "preserves unsubmitted %s input until submission before prompting once",
    async (type) => {
      const { openEditor, emit, store, cancel, updater } = await setup();
      const editor = await openEditor(type);
      emit();
      emit();
      await allowPendingWork();
      expect(editor.settled).not.toHaveBeenCalled();
      expect(editor.input.isConnected).toBe(true);
      expect(editor.input.value).toBe("Unsubmitted name");
      expect(store.selectUiType()).toBe(type);

      await editor.submit();
      await expect(editor.result).resolves.toMatchObject({
        values: { name: "Unsubmitted name" },
      });
      await vi.waitFor(() =>
        expect(store.selectConfig().message).toBe(
          EN_I18N.appPage.googlePlayUpdateReady,
        ),
      );
      cancel();
      await updater.checkForUpdates(true);
      emit();
      await allowPendingWork();
      expect(store.selectIsOpen()).toBe(false);
    },
  );

  it.each(["available", "downloaded"])(
    "defers automatic %s checks behind an open editor",
    async (status) => {
      const { openEditor, store, updater, cancel } = await setup({ status });
      const editor = await openEditor("formDialog");
      const checking = updater.checkForUpdates(true);
      await allowPendingWork();
      expect(editor.settled).not.toHaveBeenCalled();
      expect(editor.input.isConnected).toBe(true);
      await editor.submit();
      await vi.waitFor(() => expect(store.selectIsOpen()).toBe(true));
      expect(store.selectUiType()).toBe("dialog");
      cancel();
      await checking;
    },
  );

  it("waits for a follow-up editing dialog opened by the first result handler", async () => {
    const { openEditor, emit, globalUI, store, cancel } = await setup();
    const editor = await openEditor("formDialog");
    const next = editor.result.then(async () => {
      await Promise.resolve();
      return globalUI.showFormDialog({ form: { title: "Next Step" } });
    });
    const nextSettled = vi.fn();
    void next.then(nextSettled);
    emit();
    await editor.submit();
    await allowPendingWork();
    expect(nextSettled).not.toHaveBeenCalled();
    expect(store.selectUiType()).toBe("formDialog");
    expect(store.selectFormDialogConfig().form.title).toBe("Next Step");
    await globalUI.closeAll();
    await vi.waitFor(() => expect(store.selectIsOpen()).toBe(true));
    expect(store.selectConfig().message).toBe(
      EN_I18N.appPage.googlePlayUpdateReady,
    );
    cancel();
  });

  it("preserves a dialog opened while a manual Play check is in flight", async () => {
    const { openEditor, bridge, updater, store, cancel } = await setup();
    let finishCheck;
    bridge.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCheck = resolve;
        }),
    );
    const checking = updater.checkForUpdates(false);
    const editor = await openEditor("componentDialog");
    finishCheck({ status: "downloaded", versionCode: 7 });
    await allowPendingWork();
    expect(editor.settled).not.toHaveBeenCalled();
    expect(editor.input.isConnected).toBe(true);
    await editor.submit();
    await vi.waitFor(() => expect(store.selectIsOpen()).toBe(true));
    expect(store.selectConfig().message).toBe(
      EN_I18N.appPage.googlePlayUpdateReady,
    );
    cancel();
    await checking;
  });

  it("releases a deferred update after a component dialog reports an error", async () => {
    const { openEditor, emit, store, cancel, updater } = await setup();
    const editor = await openEditor("componentDialog");
    const error = new Error("Could not read form values");
    editor.input.parentElement.getValues = () => {
      throw error;
    };
    const rejected = expect(editor.result).rejects.toBe(error);
    emit();
    await editor.submit();
    await rejected;
    await vi.waitFor(() => expect(store.selectIsOpen()).toBe(true));
    expect(store.selectConfig().message).toBe(
      EN_I18N.appPage.googlePlayUpdateReady,
    );
    cancel();
    await updater.checkForUpdates(true);
  });

  it("does not show a deferred prompt after backgrounding or mark it as shown", async () => {
    const { openEditor, emit, store, isForeground, updater, cancel } =
      await setup();
    const editor = await openEditor("formDialog");
    emit();
    isForeground.mockReturnValue(false);
    await editor.submit();
    await allowPendingWork();
    expect(store.selectIsOpen()).toBe(false);
    isForeground.mockReturnValue(true);
    emit();
    await vi.waitFor(() => expect(store.selectIsOpen()).toBe(true));
    cancel();
    await updater.checkForUpdates(true);
  });

  it("defers asynchronous failure alerts without cancelling an editor", async () => {
    const { openEditor, emit, store, globalUI } = await setup();
    const editor = await openEditor("componentDialog");
    emit({ status: "failed" });
    await allowPendingWork();
    expect(editor.settled).not.toHaveBeenCalled();
    expect(editor.input.isConnected).toBe(true);
    await editor.submit();
    await vi.waitFor(() =>
      expect(store.selectConfig().message).toBe(
        EN_I18N.appPage.googlePlayUpdateFailed,
      ),
    );
    await globalUI.closeAll();
  });
});
