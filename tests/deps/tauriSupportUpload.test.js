import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage = undefined;
  },
}));

const { createTauriSupportUploadHost } = await import(
  "../../src/deps/clients/tauri/supportUpload.js"
);

describe("desktop support upload host", () => {
  it("calls the native commands with the archive ID and forwards progress", async () => {
    const invokeImpl = vi.fn(async (command, args) => {
      args.onProgress?.onmessage({ phase: "packing", current: 1, total: 2 });
      return command === "create_support_archive"
        ? { sizeBytes: 2, sha256: "ab" }
        : undefined;
    });
    const host = createTauriSupportUploadHost({ invokeImpl });
    const onProgress = vi.fn();

    expect(
      await host.createArchive({
        archiveId: "Archive1",
        projectPath: "/projects/one",
        onProgress,
      }),
    ).toEqual({ sizeBytes: 2, sha256: "ab" });
    await host.uploadArchive({
      archiveId: "Archive1",
      url: "https://storage.example/key",
      headers: [{ name: "If-None-Match", value: "*" }],
      onProgress,
    });
    await host.cancelArchive({ archiveId: "Archive1" });
    await host.discardArchive({ archiveId: "Archive1" });
    await host.readNativeFacts({ projectPath: "/projects/one" });

    expect(
      invokeImpl.mock.calls.map(([command, { onProgress: _, ...args }]) => [
        command,
        args,
      ]),
    ).toEqual([
      [
        "create_support_archive",
        { archiveId: "Archive1", projectPath: "/projects/one" },
      ],
      [
        "upload_support_archive",
        {
          archiveId: "Archive1",
          url: "https://storage.example/key",
          headers: [{ name: "If-None-Match", value: "*" }],
        },
      ],
      ["cancel_support_archive", { archiveId: "Archive1" }],
      ["discard_support_archive", { archiveId: "Archive1" }],
      ["get_support_device_facts", { projectPath: "/projects/one" }],
    ]);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith({
      phase: "packing",
      current: 1,
      total: 2,
    });
  });
});
