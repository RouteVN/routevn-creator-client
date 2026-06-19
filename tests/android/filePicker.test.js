import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  callAndroidBridge: vi.fn(),
}));

vi.mock("../../src/deps/clients/android/bridge.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/clients/android/bridge.js",
  );
  return {
    ...actual,
    callAndroidBridge: mocked.callAndroidBridge,
  };
});

import { createAndroidFilePicker } from "../../src/deps/clients/android/filePicker.js";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalFile = globalThis.File;
const originalBlob = globalThis.Blob;
const originalFetch = globalThis.fetch;

const installDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://appassets.androidplatform.net/web/index.html",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.File = dom.window.File;
  globalThis.Blob = dom.window.Blob;
  return dom;
};

describe("android file picker", () => {
  let dom;

  beforeEach(() => {
    mocked.callAndroidBridge.mockReset();
    dom = installDom();
  });

  afterEach(() => {
    dom?.window.close();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.File = originalFile;
    globalThis.Blob = originalBlob;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("clicks the VT fallback file input after appending it", async () => {
    window.RTGL_VT_RESET_APP_STATE = true;
    const clickSpy = vi
      .spyOn(window.HTMLInputElement.prototype, "click")
      .mockImplementation(function clickInput() {
        const file = {
          name: "hello.txt",
          type: "text/plain",
          lastModified: 1,
          arrayBuffer: vi.fn(async () => Uint8Array.from([104, 101]).buffer),
        };
        Object.defineProperty(this, "files", {
          configurable: true,
          value: [file],
        });
        this.onchange?.({ target: this });
      });

    const file = await createAndroidFilePicker().openFilePicker({
      multiple: false,
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(file.name).toBe("hello.txt");
    expect(document.getElementById("routevnAndroidFilePickerInput")).toBeNull();
  });

  it("cleans native picker request files after reading descriptors", async () => {
    const fetchedUrls = [];
    const deletedRequests = [];
    globalThis.fetch = vi.fn(async (url) => {
      fetchedUrls.push(url);
      return new Response(new Blob(["hello"], { type: "text/plain" }), {
        status: 200,
      });
    });
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "openFilePicker") {
        Promise.resolve().then(() => {
          window.__routeVNAndroidFilePickerResult({
            requestId: payload.requestId,
            files: [
              {
                requestId: payload.requestId,
                fileId: "file-0",
                name: "hello.txt",
                type: "text/plain",
                url: `https://appassets.androidplatform.net/android-files/picker/${payload.requestId}/files/file-0`,
              },
            ],
          });
        });
        return true;
      }

      if (method === "deletePickerRequest") {
        deletedRequests.push(payload.requestId);
        return true;
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const file = await createAndroidFilePicker().openFilePicker({
      multiple: false,
    });

    expect(file.name).toBe("hello.txt");
    expect(fetchedUrls).toEqual([
      "https://appassets.androidplatform.net/android-files/picker/picker-1/files/file-0",
    ]);
    expect(deletedRequests).toEqual(["picker-1"]);
  });

  it("opens the native save picker when no bytes are supplied", async () => {
    let savePayload;
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "openSaveFilePicker") {
        savePayload = payload;
        Promise.resolve().then(() => {
          window.__routeVNAndroidSaveFileResult({
            requestId: payload.requestId,
            uri: "content://exports/project_version.zip",
          });
        });
        return true;
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const selectedUri = await createAndroidFilePicker().saveFilePicker({
      defaultPath: "project_version.zip",
      mimeType: "application/zip",
    });

    expect(selectedUri).toBe("content://exports/project_version.zip");
    expect(savePayload).toEqual({
      requestId: "save-1",
      filename: "project_version.zip",
      mimeType: "application/zip",
    });
  });

  it("writes supplied bytes to a selected Android save URI", async () => {
    let writePayload;
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "writeFileToUri") {
        writePayload = payload;
        return payload.uri;
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const selectedUri = await createAndroidFilePicker().saveFilePicker({
      uri: "content://exports/project_version.zip",
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: "application/zip",
    });

    expect(selectedUri).toBe("content://exports/project_version.zip");
    expect(writePayload).toEqual({
      uri: "content://exports/project_version.zip",
      mimeType: "application/zip",
      base64: "AQID",
    });
  });
});
