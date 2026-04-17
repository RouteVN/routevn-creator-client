import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectCollabService } from "../../src/deps/services/shared/collab/createProjectCollabService.js";

const { createCommandSyncSessionMock } = vi.hoisted(() => ({
  createCommandSyncSessionMock: vi.fn(),
}));

vi.mock("insieme/client", () => ({
  createCommandSyncSession: createCommandSyncSessionMock,
}));

const createSceneCreateCommand = () => ({
  id: "cmd-scene-1",
  partition: "m",
  projectId: "project-1",
  actor: {
    userId: "user-1",
    clientId: "client-1",
  },
  clientTs: 1,
  schemaVersion: 1,
  type: "scene.create",
  payload: {
    sceneId: "scene-1",
    data: {
      name: "Scene 1",
    },
  },
});

const createSessionMock = ({ submitCommands } = {}) => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  submitCommands,
  submitEvent: vi.fn(async () => {}),
  syncNow: vi.fn(async () => {}),
  flushDrafts: vi.fn(async () => {}),
  setOnlineTransport: vi.fn(async () => {}),
  getStatus: vi.fn(() => ({ connected: false })),
  getLastError: vi.fn(() => null),
  clearLastError: vi.fn(() => {}),
  getActor: vi.fn(() => ({
    userId: "user-1",
    clientId: "client-1",
  })),
});

describe("createProjectCollabService", () => {
  beforeEach(() => {
    createCommandSyncSessionMock.mockReset();
  });

  it("does not advance projected state when submitCommands fails", async () => {
    const submitCommands = vi
      .fn()
      .mockRejectedValueOnce(new Error("submit failed"))
      .mockResolvedValueOnce(["cmd-scene-1"]);

    createCommandSyncSessionMock.mockReturnValue(
      createSessionMock({
        submitCommands,
      }),
    );

    const service = createProjectCollabService({
      projectId: "project-1",
      token: "token-1",
      actor: {
        userId: "user-1",
        clientId: "client-1",
      },
      initialRepositoryState: undefined,
    });

    const command = createSceneCreateCommand();

    await expect(service.submitCommands([command])).resolves.toMatchObject({
      valid: false,
      error: {
        code: "submit_failed",
        message: "submit failed",
      },
    });

    await expect(service.submitCommands([command])).resolves.toEqual({
      valid: true,
      commandIds: ["cmd-scene-1"],
    });

    expect(submitCommands).toHaveBeenCalledTimes(2);
    expect(submitCommands).toHaveBeenNthCalledWith(1, [command]);
    expect(submitCommands).toHaveBeenNthCalledWith(2, [command]);
  });
});
