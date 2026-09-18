import { expect, it, vi } from "vitest";
const { bridge, createConnection } = vi.hoisted(() => ({
  bridge: vi.fn(async () => ({})),
  createConnection: vi.fn(),
}));
vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  callAndroidBridge: bridge,
}));
vi.mock("../../src/deps/clients/android/sqlite.js", () => ({
  createAndroidSqliteConnection: createConnection,
}));
import { prepareAndroidProjectBackup } from "../../src/deps/services/android/collabClientStore.js";
it("backs up a closed project without caching an unconfigured materialized-view store", async () => {
  await prepareAndroidProjectBackup({ projectId: "one" });
  expect(bridge).toHaveBeenCalledWith("prepareProjectBackup", {
    projectId: "one",
  });
  expect(createConnection).not.toHaveBeenCalled();
});
