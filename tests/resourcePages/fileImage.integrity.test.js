import { describe, expect, it, vi } from "vitest";
import * as actions from "../../src/components/fileImage/fileImage.store.js";
import {
  handleAfterMount,
  handleBeforeMount,
  handleOnUpdate,
} from "../../src/components/fileImage/fileImage.handlers.js";

const setup = () => {
  const context = {
    state: actions.createInitialState(),
    props: {
      fileId: "thumbnail-one",
      originalFileId: "original-one",
      showErrorMessage: true,
    },
  };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  const deps = {
    store,
    props: context.props,
    render: vi.fn(),
    projectService: {
      getFileContent: vi.fn(async (id) => ({ url: `asset://${id}` })),
      checkFileIntegrity: vi.fn(async () => ({ verified: true })),
    },
  };
  return { context, deps };
};

describe("file image integrity feedback", () => {
  it("keeps the thumbnail hidden until verification completes and warns on a damaged original", async () => {
    const { context, deps } = setup();
    let reject;
    deps.projectService.checkFileIntegrity.mockImplementation((id) =>
      id === "original-one"
        ? new Promise((_, fail) => {
            reject = fail;
          })
        : Promise.resolve(),
    );
    const load = handleAfterMount(deps);
    await vi.waitFor(() =>
      expect(context.state.src).toBe("asset://thumbnail-one"),
    );
    expect(context.state.hasError).toBe(false);
    expect(actions.selectViewData(context).hasSrc).toBe(false);
    reject(new Error("checksum mismatch"));
    await load;
    expect(context.state.hasError).toBe(true);
    expect(actions.selectViewData(context).reuploadMessage).toContain(
      "re-upload",
    );
    expect(deps.projectService.getFileContent).toHaveBeenCalledWith(
      "thumbnail-one",
    );
    expect(deps.projectService.getFileContent).not.toHaveBeenCalledWith(
      "original-one",
    );
  });

  it("clears the warning when re-upload changes the original but keeps the thumbnail", async () => {
    const { context, deps } = setup();
    deps.projectService.checkFileIntegrity.mockRejectedValueOnce(
      new Error("missing"),
    );
    await handleAfterMount(deps);
    expect(context.state.hasError).toBe(true);
    deps.props = context.props = {
      ...context.props,
      originalFileId: "replacement-one",
    };
    await handleOnUpdate(deps, { newProps: deps.props });
    expect(context.state.hasError).toBe(false);
    expect(deps.projectService.checkFileIntegrity).toHaveBeenCalledWith(
      "replacement-one",
    );
  });

  it("ignores a stale failed check after the image is replaced or unmounted", async () => {
    const { context, deps } = setup();
    const cleanup = handleBeforeMount(deps);
    let reject;
    deps.projectService.checkFileIntegrity.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const previous = handleAfterMount(deps);
    await vi.waitFor(() =>
      expect(context.state.src).toBe("asset://thumbnail-one"),
    );
    deps.props = context.props = {
      ...context.props,
      fileId: "thumbnail-two",
      originalFileId: "original-two",
    };
    await handleOnUpdate(deps, { newProps: deps.props });
    cleanup();
    const renderCount = deps.render.mock.calls.length;
    reject(new Error("old failure"));
    await previous;
    expect(context.state.hasError).toBe(false);
    expect(deps.render).toHaveBeenCalledTimes(renderCount);
  });
});
