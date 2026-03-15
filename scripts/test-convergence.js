import assert from "node:assert/strict";
import {
  createCommandEnvelope,
} from "../src/deps/services/shared/collab/commandEnvelope.js";
import {
  createProjectedSyncHarness,
  normalizeStateForCompare,
  waitFor,
} from "./collabTestSupport.js";

const projectId = "project-conv-001";
const harness = createProjectedSyncHarness({
  projectName: "Convergence",
  projectDescription: "two-client",
});
const clientAEntry = harness.createClient({
  projectId,
  userId: "user-1",
  clientId: "client-a",
  partitions: [
    `project:${projectId}:story`,
    `project:${projectId}:resources`,
    `project:${projectId}:layouts`,
  ],
  connectionId: "conn-a",
  latencyMs: 5,
});
const clientBEntry = harness.createClient({
  projectId,
  userId: "user-2",
  clientId: "client-b",
  partitions: [
    `project:${projectId}:story`,
    `project:${projectId}:resources`,
    `project:${projectId}:layouts`,
  ],
  connectionId: "conn-b",
  latencyMs: 5,
});
const clientA = clientAEntry.client;
const clientB = clientBEntry.client;
const actorA = clientAEntry.actor;
const actorB = clientBEntry.actor;

try {
  await clientA.start();
  await clientB.start();

  await clientA.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      type: "scene.create",
      payload: { sceneId: "scene-1", data: { name: "Scene 1" } },
      actor: actorA,
      clientTs: 1000,
    }),
  );

  await waitFor(() => Boolean(clientB.getState().scenes["scene-1"]), {
    label: "clientB.scene-1",
  });

  await clientB.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      type: "section.create",
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        data: { name: "Section 1" },
      },
      actor: actorB,
      clientTs: 1100,
    }),
  );

  await waitFor(() => Boolean(clientA.getState().sections["section-1"]), {
    label: "clientA.section-1",
  });

  await clientA.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "story",
      type: "line.insert_after",
      payload: {
        lineId: "line-1",
        sectionId: "section-1",
        data: { actions: { narration: "hello world" } },
      },
      actor: actorA,
      clientTs: 1200,
    }),
  );

  await waitFor(() => Boolean(clientB.getState().lines["line-1"]), {
    label: "clientB.line-1",
  });

  await clientB.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "resources",
      type: "resource.create",
      payload: {
        resourceType: "images",
        resourceId: "img-1",
        data: { name: "bg-1", fileId: "file-1" },
      },
      actor: actorB,
      clientTs: 1300,
    }),
  );

  await waitFor(
    () => Boolean(clientA.getState().resources.images.items["img-1"]),
    { label: "clientA.images.img-1" },
  );

  await clientA.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "resources",
      type: "resource.create",
      payload: {
        resourceType: "layouts",
        resourceId: "layout-1",
        data: { name: "Layout 1", layoutType: "scene" },
      },
      actor: actorA,
      clientTs: 1400,
    }),
  );

  await waitFor(
    () => Boolean(clientB.getState().resources.layouts.items["layout-1"]),
    {
      label: "clientB.resources.layouts.layout-1",
    },
  );

  await clientB.submitCommand(
    createCommandEnvelope({
      projectId,
      scope: "layouts",
      type: "layout.element.create",
      payload: {
        layoutId: "layout-1",
        elementId: "el-1",
        data: { type: "text", x: 100, y: 100, opacity: 1 },
      },
      actor: actorB,
      clientTs: 1500,
    }),
  );

  await waitFor(
    () =>
      Boolean(
        clientA.getState().resources.layouts.items["layout-1"]?.elements?.[
          "el-1"
        ],
      ),
    { label: "clientA.resources.layouts.layout-1.el-1" },
  );

  await clientA.syncNow();
  await clientB.syncNow();

  const stateA = clientA.getState();
  const stateB = clientB.getState();

  assert.deepEqual(
    normalizeStateForCompare(stateA),
    normalizeStateForCompare(stateB),
  );

  assert.equal(clientA.getLastError(), null);
  assert.equal(clientB.getLastError(), null);

  console.log("Two-client convergence: PASS");
} finally {
  await clientA.stop();
  await clientB.stop();
  await harness.server.shutdown();
}
