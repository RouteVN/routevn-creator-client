import { expect, it } from "vitest";
import { createAssetLoadSessionGuard } from "../../src/internal/ui/assetLoadSessionGuard.js";

it("invalidates a load when its project, canvas, or cache changes", () => {
  let projectId = "project-one";
  let cacheCurrent = true;
  const canvas = { isConnected: true };
  const isCurrent = createAssetLoadSessionGuard({
    projectService: { getEnsuredProjectId: () => projectId },
    canvas,
    isCacheCurrent: () => cacheCurrent,
  });
  expect(isCurrent()).toBe(true);
  projectId = "project-two";
  expect(isCurrent()).toBe(false);
  projectId = undefined;
  expect(isCurrent()).toBe(false);
  projectId = "project-one";
  canvas.isConnected = false;
  expect(isCurrent()).toBe(false);
  canvas.isConnected = true;
  cacheCurrent = false;
  expect(isCurrent()).toBe(false);
});
