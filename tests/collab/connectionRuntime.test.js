import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCollabConnectionRuntime,
  resolveCollabDebugEnabled,
} from "../../src/deps/services/web/collab/connectionRuntime.js";

const originalLocalStorage = globalThis.localStorage;

describe("collab connection runtime debug flag", () => {
  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  it("defaults to false without reading localStorage", () => {
    globalThis.localStorage = {
      getItem: vi.fn(() => "true"),
    };

    expect(resolveCollabDebugEnabled()).toBe(false);
    expect(globalThis.localStorage.getItem).not.toHaveBeenCalled();
  });

  it("respects the explicit enabled override", () => {
    expect(resolveCollabDebugEnabled({ enabled: true })).toBe(true);
    expect(resolveCollabDebugEnabled({ enabled: false })).toBe(false);
  });
});

const createConnectionRuntimeTestContext = ({
  initialRemoteSyncCompleted = false,
  projectEntries = [],
} = {}) => {
  const session = {
    hasCompletedInitialRemoteSync: vi.fn(() => initialRemoteSyncCompleted),
  };
  const projectService = {
    createCollabSession: vi.fn(async () => session),
    ensureProjectContentPatches: vi.fn(async () => {}),
    getCollabSession: vi.fn(() => undefined),
    getCollabSessionMode: vi.fn(() => undefined),
    stopCollabSession: vi.fn(async () => {}),
  };
  const runtime = createCollabConnectionRuntime({
    projectService,
    router: {
      getPayload: () => ({ p: "project-1" }),
    },
    db: {
      get: vi.fn(async () => projectEntries),
    },
    collabDebugLog: vi.fn(),
  });

  return {
    projectService,
    runtime,
  };
};

describe("collab connection runtime project content patches", () => {
  it("applies project content patches after initial remote sync completes", async () => {
    const { projectService, runtime } = createConnectionRuntimeTestContext({
      initialRemoteSyncCompleted: true,
    });

    await runtime.connectCollabDebugSession({
      endpointUrl: "ws://localhost:1234/sync",
      userId: "user-1",
      clientId: "client-1",
      token: "token-1",
    });

    expect(projectService.ensureProjectContentPatches).toHaveBeenCalledTimes(1);
    expect(
      projectService.createCollabSession.mock.invocationCallOrder[0],
    ).toBeLessThan(
      projectService.ensureProjectContentPatches.mock.invocationCallOrder[0],
    );
  });

  it("does not apply project content patches when initial remote sync fails", async () => {
    const { projectService, runtime } = createConnectionRuntimeTestContext({
      initialRemoteSyncCompleted: false,
    });

    await runtime.connectCollabDebugSession({
      endpointUrl: "ws://localhost:1234/sync",
      userId: "user-1",
      clientId: "client-1",
      token: "token-1",
    });

    expect(projectService.ensureProjectContentPatches).not.toHaveBeenCalled();
  });

  it("applies project content patches directly for local projects", async () => {
    const { projectService, runtime } = createConnectionRuntimeTestContext({
      projectEntries: [{ id: "project-1" }],
    });

    await runtime.bootCollabAutoConnect();

    expect(projectService.createCollabSession).not.toHaveBeenCalled();
    expect(projectService.ensureProjectContentPatches).toHaveBeenCalledTimes(1);
  });
});
