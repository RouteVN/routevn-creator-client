import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  callIOSBridge: vi.fn(),
}));

vi.mock("../../src/deps/clients/ios/bridge.js", async () => {
  const actual = await vi.importActual("../../src/deps/clients/ios/bridge.js");
  return {
    ...actual,
    callIOSBridge: mocked.callIOSBridge,
  };
});

import { createIOSFilePicker } from "../../src/deps/clients/ios/filePicker.js";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalFile = globalThis.File;
const originalBlob = globalThis.Blob;
const originalFetch = globalThis.fetch;

const installDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://routevn.ios/ios/index.html",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.File = dom.window.File;
  globalThis.Blob = dom.window.Blob;
  return dom;
};

describe("ios file picker", () => {
  let dom;

  beforeEach(() => {
    mocked.callIOSBridge.mockReset();
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

    const file = await createIOSFilePicker().openFilePicker({
      multiple: false,
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(file.name).toBe("hello.txt");
    expect(document.getElementById("routevnIOSFilePickerInput")).toBeNull();
  });

  it("cleans native picker request files after reading descriptors", async () => {
    const fetchedUrls = [];
    const deletedRequests = [];
    let pickerPayload;
    globalThis.fetch = vi.fn(async (url) => {
      fetchedUrls.push(url);
      return new Response(new Blob(["hello"], { type: "text/plain" }), {
        status: 200,
      });
    });
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "openFilePicker") {
        pickerPayload = payload;
        Promise.resolve().then(() => {
          window.__routeVNIOSFilePickerResult({
            requestId: payload.requestId,
            files: [
              {
                requestId: payload.requestId,
                fileId: "file-0",
                name: "hello.txt",
                type: "text/plain",
                url: `routevn://app/ios-files/picker/${payload.requestId}/files/file-0`,
              },
            ],
          });
        });
        return Promise.resolve(true);
      }

      if (method === "deletePickerRequest") {
        deletedRequests.push(payload.requestId);
        return Promise.resolve(true);
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const file = await createIOSFilePicker().openFilePicker({
      multiple: false,
      accept: "image/*",
    });

    expect(file.name).toBe("hello.txt");
    expect(pickerPayload).toEqual({
      requestId: "picker-1",
      multiple: false,
      accept: "image/*",
    });
    expect(fetchedUrls).toEqual([
      "routevn://app/ios-files/picker/picker-1/files/file-0",
    ]);
    expect(deletedRequests).toEqual(["picker-1"]);
  });

  it("opens the native save picker when no bytes are supplied", async () => {
    let savePayload;
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "openSaveFilePicker") {
        savePayload = payload;
        Promise.resolve().then(() => {
          window.__routeVNIOSSaveFileResult({
            requestId: payload.requestId,
            uri: "file:///exports/project_version.zip",
          });
        });
        return Promise.resolve(true);
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const selectedUri = await createIOSFilePicker().saveFilePicker({
      defaultPath: "project_version.zip",
      mimeType: "application/zip",
    });

    expect(selectedUri).toBe("file:///exports/project_version.zip");
    expect(savePayload).toEqual({
      requestId: "save-1",
      filename: "project_version.zip",
      mimeType: "application/zip",
    });
  });

  it("opens the native folder picker with writable access when requested", async () => {
    let folderPayload;
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "openFolderPicker") {
        folderPayload = payload;
        Promise.resolve().then(() => {
          window.__routeVNIOSFolderPickerResult({
            requestId: payload.requestId,
            folder: {
              uri: "routevn-folder://selected/folder-1",
              name: "Exports",
              sourceUri: "file:///exports",
            },
          });
        });
        return Promise.resolve(true);
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const folder = await createIOSFilePicker().openFolderPicker({
      title: "Select Export Folder",
      writable: true,
    });

    expect(folder).toEqual({
      uri: "routevn-folder://selected/folder-1",
      name: "Exports",
      sourceUri: "file:///exports",
    });
    expect(folderPayload).toEqual({
      requestId: "folder-1",
      title: "Select Export Folder",
      writable: true,
    });
  });

  it("writes supplied bytes to a selected iOS save URI", async () => {
    let writePayload;
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "writeFileToUri") {
        writePayload = payload;
        return Promise.resolve(payload.uri);
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const selectedUri = await createIOSFilePicker().saveFilePicker({
      uri: "file:///exports/project_version.zip",
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: "application/zip",
    });

    expect(selectedUri).toBe("file:///exports/project_version.zip");
    expect(writePayload).toEqual({
      uri: "file:///exports/project_version.zip",
      mimeType: "application/zip",
      base64: "AQID",
    });
  });

  it("writes supplied blobs to iOS downloads", async () => {
    let writePayload;
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "writeDownloadFile") {
        writePayload = payload;
        return Promise.resolve("file:///downloads/readme.txt");
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });

    const selectedUri = await createIOSFilePicker().saveFilePicker(
      new Blob(["hello"], { type: "text/plain" }),
      "readme.txt",
    );

    expect(selectedUri).toBe("file:///downloads/readme.txt");
    expect(writePayload).toEqual({
      filename: "readme.txt",
      mimeType: "text/plain",
      base64: "aGVsbG8=",
    });
  });
});
