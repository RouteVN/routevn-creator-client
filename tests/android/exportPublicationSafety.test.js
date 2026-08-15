import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Android export publication safety", () => {
  it("keeps MediaStore downloads pending until a verified write succeeds", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain(
      "values.put(MediaStore.MediaColumns.IS_PENDING, 1)",
    );
    expect(activity).toContain(
      "publishedValues.put(MediaStore.MediaColumns.IS_PENDING, 0)",
    );
    expect(activity).toContain("writeBytesToUriAndVerify(uri, bytes)");
    expect(activity).toContain("resolver.update(uri, publishedValues");
    expect(activity).toContain("deletePublishedUri(uri)");
  });

  it("marks folder exports incomplete until every copied file is verified", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain('"ROUTEVN_EXPORT_INCOMPLETE.txt"');
    expect(activity).toContain(
      "validateProjectDatabaseForExport(projectDbFile)",
    );
    expect(activity).toContain(
      "copyFileToUriAndVerify(sourceFile, outputFileUri)",
    );
    expect(activity).toContain("deletePublishedUri(incompleteMarkerUri)");
    expect(activity).toContain(
      '" An incomplete output may remain at the selected location. "',
    );
  });

  it("validates ZIP structure and tracks picker-created files for cleanup", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );
    const adapters = await readRepoFile(
      "src/deps/services/android/projectServiceAdapters.js",
    );

    expect(activity).toContain("validateDistributionZip(outputFile, true)");
    expect(activity).toContain('archive.getEntry("package.bin")');
    expect(activity).toContain("rememberPendingSaveDocument(saveDocumentUri)");
    expect(activity).toContain("claimPendingSaveDocument(destinationUri)");
    expect(activity).toContain("cleanupPendingSaveDocuments()");
    expect(adapters).not.toContain(
      "Native Android ZIP export failed; falling back to JavaScript ZIP.",
    );
  });
});
