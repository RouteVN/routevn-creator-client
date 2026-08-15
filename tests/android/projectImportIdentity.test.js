import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Android project import identity", () => {
  it("installs every import under a newly assigned project id", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain('payload.getString("projectId")');
    expect(activity).toContain("rewriteImportedProjectIdentity(");
    expect(activity).toContain('projectInfo.put("id", targetProjectId)');
    expect(activity).toContain(
      'committedIdentity.put("project_id", targetProjectId)',
    );
    expect(activity).toContain('"collab.lastCommittedId:" + sourceProjectId');
    expect(activity).toContain(
      "File importWorkDir = new File(importRoot, projectId)",
    );
    expect(activity).toContain("assertDatabaseIntegrity(database)");
    expect(activity).toContain(
      "Os.rename(stagedRoot.getAbsolutePath(), projectRoot.getAbsolutePath())",
    );
    expect(activity).not.toContain(
      'database.delete("materialized_view_state", null, null)',
    );
    expect(activity).not.toContain('result.put("alreadyImported"');
  });
});
