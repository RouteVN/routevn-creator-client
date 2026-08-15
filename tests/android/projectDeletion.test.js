import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Android project deletion", () => {
  it("closes native project resources before deleting the full storage root", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain('case "deleteProject":');
    expect(activity).toContain(
      'deleteProjectStorage(payload.getString("projectId"))',
    );
    expect(activity).toContain("closeProjectFileWriteSessions(safeProjectId)");
    expect(activity).toContain(
      "closeDatabase(getProjectDatabasePath(safeProjectId))",
    );
    expect(activity).toContain("deleteRecursively(projectRoot)");
  });
});
