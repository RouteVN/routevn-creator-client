import { describe, expect, it, vi } from "vitest";
import {
  handleFormAction,
  handleFormChange,
  handleFormInput,
  handleBeforeMount,
  handleProjectIconClick,
} from "../../src/components/projectCreateDialog/projectCreateDialog.handlers.js";
import * as dialogStore from "../../src/components/projectCreateDialog/projectCreateDialog.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("projectCreateDialog handlers", () => {
  const createIOSDialog = (previewNewProjectLocation) => {
    const state = dialogStore.createInitialState();
    const store = Object.fromEntries(
      Object.entries(dialogStore).map(([name, action]) => [
        name,
        (payload) => action({ state, i18n: EN_I18N }, payload),
      ]),
    );
    return {
      appService: { previewNewProjectLocation },
      store,
      props: { platform: "ios", defaultValues: {} },
      render: vi.fn(),
      i18n: EN_I18N,
    };
  };

  it("refreshes the iOS destination as the name changes and discards stale previews", async () => {
    const requests = [];
    const deps = createIOSDialog(
      vi.fn(
        ({ name }) =>
          new Promise((resolve) => requests.push({ name, resolve })),
      ),
    );
    const cleanup = handleBeforeMount(deps);
    const change = (name) =>
      handleFormInput(deps, {
        _event: { detail: { name: "name", value: name, values: { name } } },
      });
    const first = change("Project / One");
    const second = change("Project Two");
    const location = {
      folderName: "Project Two (2)",
      displayPath: "On My iPhone / RouteVN Projects / Project Two (2)",
    };
    requests[2].resolve(location);
    await second;
    requests[1].resolve({
      folderName: "Project - One",
      displayPath: "Old path",
    });
    await first;
    requests[0].resolve({
      folderName: "Untitled Project",
      displayPath: "Initial path",
    });
    await Promise.resolve();
    expect(deps.store.selectViewData().projectLocation).toEqual(location);
    expect(requests.map(({ name }) => name)).toEqual([
      "",
      "Project / One",
      "Project Two",
    ]);
    const pending = change("Project Three");
    cleanup();
    requests[3].resolve({
      folderName: "Project Three",
      displayPath: "Closed dialog",
    });
    await pending;
    expect(deps.store.selectIsLocationReady()).toBe(false);
  });

  it("shows a destination error and blocks iOS submission if the location cannot be checked", async () => {
    const deps = createIOSDialog(
      vi.fn(async () => {
        throw new Error("Unavailable folder");
      }),
    );
    handleBeforeMount(deps);
    await handleFormChange(deps, {
      _event: { detail: { values: { name: "Project One" } } },
    });
    deps.refs = {
      createProjectForm: { validate: () => ({ valid: true, errors: {} }) },
    };
    deps.dispatchEvent = vi.fn();
    handleFormAction(deps, { _event: { detail: { actionId: "submit" } } });
    expect(deps.store.selectViewData().projectLocationMessage).toBe(
      EN_I18N.projectsPage.failedPreviewProjectLocation,
    );
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("keeps the visible destination during edits without accepting an outdated preview", async () => {
    const requests = [];
    const deps = createIOSDialog(
      ({ name }) =>
        new Promise((resolve, reject) =>
          requests.push({ name, resolve, reject }),
        ),
    );
    deps.refs = {
      createProjectForm: { validate: () => ({ valid: true, errors: {} }) },
    };
    deps.dispatchEvent = vi.fn();
    handleBeforeMount(deps);
    const initialLocation = {
      folderName: "Untitled Project",
      displayPath: "On My iPhone / RouteVN Projects / Untitled Project",
    };
    requests[0].resolve(initialLocation);
    await Promise.resolve();
    const change = (name) =>
      handleFormInput(deps, {
        _event: { detail: { name: "name", value: name, values: { name } } },
      });
    const first = change("Project One");
    const second = change("Project Two");
    expect(deps.store.selectViewData().projectLocation).toEqual(
      initialLocation,
    );
    expect(deps.store.selectIsLocationReady()).toBe(false);
    handleFormAction(deps, { _event: { detail: { actionId: "submit" } } });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();

    requests[1].resolve({ folderName: "Project One", displayPath: "Old path" });
    await first;
    expect(deps.store.selectViewData().projectLocation).toEqual(
      initialLocation,
    );
    expect(deps.store.selectIsLocationReady()).toBe(false);

    const updatedLocation = {
      folderName: "Project Two",
      displayPath: "On My iPhone / RouteVN Projects / Project Two",
    };
    requests[2].resolve(updatedLocation);
    await second;
    expect(deps.store.selectViewData().projectLocation).toEqual(
      updatedLocation,
    );
    expect(deps.store.selectIsLocationReady()).toBe(true);

    const failed = change("Project Three");
    requests[3].reject(new Error("Unavailable folder"));
    await failed;
    expect(deps.store.selectViewData().projectLocation).toBeUndefined();
    expect(deps.store.selectViewData().projectLocationError).toBe(true);
    expect(deps.store.selectIsLocationReady()).toBe(false);
  });

  it("requires project icon sources to be at least 512px", async () => {
    const deps = {
      appService: {
        pickFiles: vi.fn(async () => undefined),
      },
      store: {},
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleProjectIconClick(deps);

    expect(deps.appService.pickFiles).toHaveBeenCalledWith({
      accept: "image/*",
      multiple: false,
      validations: [
        {
          type: "image-min-size",
          minWidth: 512,
          minHeight: 512,
        },
      ],
    });
  });

  it("emits validated values from the sticky form action", () => {
    const dispatchEvent = vi.fn();
    const deps = {
      dispatchEvent,
      i18n: EN_I18N,
      refs: {
        createProjectForm: {
          getValues: vi.fn(() => ({ name: "Project One" })),
          validate: vi.fn(() => ({ valid: true, errors: {} })),
        },
      },
      render: vi.fn(),
      store: {
        selectDefaultValues: vi.fn(() => ({ language: "en" })),
        selectIconFile: vi.fn(() => undefined),
        selectPlatform: vi.fn(() => "android"),
        selectProjectPath: vi.fn(() => ""),
        setValidationErrors: vi.fn(),
      },
    };

    handleFormAction(deps, {
      _event: { detail: { actionId: "submit", valid: true } },
    });

    const event = dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe("submit");
    expect(event.detail).toEqual({
      values: {
        language: "en",
        name: "Project One",
        projectPath: "",
        iconFile: undefined,
      },
    });
  });
});
