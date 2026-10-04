import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

// The mobile host, the progress clients and both native bridges are written
// separately and only meet at runtime, so a renamed method, payload key or
// progress callback would break an import without failing any other test.
describe("native import contract", () => {
  it("has every method and the progress callback the mobile host uses on both bridges", async () => {
    const host = await readRepoFile(
      "src/deps/clients/mobileProjectImportHost.js",
    );
    const androidProgress = await readRepoFile(
      "src/deps/clients/android/transferProgress.js",
    );
    const iosProgress = await readRepoFile(
      "src/deps/clients/ios/transferProgress.js",
    );
    const android = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );
    const ios = await readRepoFile("ios/routevn/routevn/RouteVNApp.swift");

    const methods = new Set(
      [...host.matchAll(/(?:callBridge\(|method:)\s*"([A-Za-z]+)"/g)].map(
        (match) => match[1],
      ),
    );
    expect([...methods].sort()).toEqual([
      "copyImportFile",
      "createTempFolder",
      "downloadFile",
      "extractImportArchive",
      "listImportArchive",
      "listImportDirectory",
      "removeTempFolder",
    ]);
    for (const method of [...methods, "importProjectFolder"]) {
      expect(android, `Android ${method}`).toContain(`case "${method}"`);
      expect(ios, `iOS ${method}`).toContain(`"${method}"`);
    }

    const androidCallback = androidProgress.match(/callbackName: "(\w+)"/)[1];
    const iosCallback = iosProgress.match(/callbackName: "(\w+)"/)[1];
    expect(android).toContain(`window.${androidCallback}`);
    expect(ios).toContain(`"${iosCallback}"`);

    expect(host).toContain("tempFolderId");
    expect(android).toContain('payload.optString("tempFolderId")');
    expect(android).toContain('event.put("tempFolderId"');
    expect(ios).toContain('"tempFolderId"');
  });
});
