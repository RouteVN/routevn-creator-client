import assert from "node:assert/strict";
import { createCommandEnvelope } from "../src/deps/services/shared/collab/commandEnvelope.js";
import {
  createProjectedSyncHarness,
  normalizeStateForCompare,
  sleep,
  waitFor,
} from "./collabTestSupport.js";

const runScenario = async (name, fn) => {
  await fn();
  console.log(`PASS: ${name}`);
};

await runScenario("late-join-catchup", async () => {
  const projectId = "project-int-latejoin";
  const harness = createProjectedSyncHarness();
  const a = harness.createClient({
    projectId,
    userId: "u1",
    clientId: "a",
    partitions: [`project:${projectId}:story`],
    connectionId: "latejoin-a",
  });
  const b = harness.createClient({
    projectId,
    userId: "u2",
    clientId: "b",
    partitions: [`project:${projectId}:story`],
    connectionId: "latejoin-b",
  });

  try {
    await a.client.start();
    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "scene.create",
        payload: { sceneId: "scene-1", data: { name: "Scene 1" } },
        actor: a.actor,
        clientTs: 1000,
      }),
    );
    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "section.create",
        payload: {
          sceneId: "scene-1",
          sectionId: "section-1",
          data: { name: "Section 1" },
        },
        actor: a.actor,
        clientTs: 1100,
      }),
    );
    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "line.create",
        payload: {
          sectionId: "section-1",
          lines: [
            {
              lineId: "line-1",
              data: { actions: { narration: "hello" } },
            },
          ],
        },
        actor: a.actor,
        clientTs: 1200,
      }),
    );

    await b.client.start();
    await waitFor(() => Boolean(b.client.getState().lines["line-1"]), {
      label: "late join client catch-up line-1",
    });

    await a.client.syncNow();
    await b.client.syncNow();

    assert.deepEqual(
      normalizeStateForCompare(a.client.getState()),
      normalizeStateForCompare(b.client.getState()),
    );
  } finally {
    await a.client.stop();
    await b.client.stop();
    await harness.server.shutdown();
  }
});

await runScenario("concurrent-two-client-writes", async () => {
  const projectId = "project-int-concurrent";
  const harness = createProjectedSyncHarness();
  const a = harness.createClient({
    projectId,
    userId: "u1",
    clientId: "a",
    partitions: [`project:${projectId}:story`],
    connectionId: "concurrent-a",
  });
  const b = harness.createClient({
    projectId,
    userId: "u2",
    clientId: "b",
    partitions: [`project:${projectId}:story`],
    connectionId: "concurrent-b",
  });

  try {
    await a.client.start();
    await b.client.start();

    await a.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "scene.create",
        payload: { sceneId: "scene-1", data: { name: "Scene 1" } },
        actor: a.actor,
        clientTs: 2000,
      }),
    );
    await waitFor(() => Boolean(b.client.getState().scenes["scene-1"]), {
      label: "client B sees scene-1",
    });

    await Promise.all([
      a.client.submitCommand(
        createCommandEnvelope({
          projectId,
          scope: "story",
          type: "section.create",
          payload: {
            sceneId: "scene-1",
            sectionId: "section-a",
            data: { name: "A" },
          },
          actor: a.actor,
          clientTs: 2100,
        }),
      ),
      b.client.submitCommand(
        createCommandEnvelope({
          projectId,
          scope: "story",
          type: "section.create",
          payload: {
            sceneId: "scene-1",
            sectionId: "section-b",
            data: { name: "B" },
          },
          actor: b.actor,
          clientTs: 2200,
        }),
      ),
    ]);

    await waitFor(
      () =>
        Boolean(a.client.getState().sections["section-a"]) &&
        Boolean(a.client.getState().sections["section-b"]) &&
        Boolean(b.client.getState().sections["section-a"]) &&
        Boolean(b.client.getState().sections["section-b"]),
      { label: "both clients see both sections" },
    );

    await a.client.syncNow();
    await b.client.syncNow();

    assert.deepEqual(
      normalizeStateForCompare(a.client.getState()),
      normalizeStateForCompare(b.client.getState()),
    );
  } finally {
    await a.client.stop();
    await b.client.stop();
    await harness.server.shutdown();
  }
});

await runScenario("partition-isolation", async () => {
  const projectId = "project-int-partitions";
  const harness = createProjectedSyncHarness();
  const full = harness.createClient({
    projectId,
    userId: "u1",
    clientId: "full",
    partitions: [
      `project:${projectId}:story`,
      `project:${projectId}:resources`,
    ],
    connectionId: "partition-full",
  });
  const storyOnly = harness.createClient({
    projectId,
    userId: "u2",
    clientId: "story",
    partitions: [`project:${projectId}:story`],
    connectionId: "partition-story",
  });

  try {
    await full.client.start();
    await storyOnly.client.start();

    await full.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "resources",
        type: "image.create",
        payload: {
          imageId: "img-1",
          data: {
            type: "image",
            name: "bg",
            fileId: "file-1",
          },
        },
        actor: full.actor,
        clientTs: 3000,
      }),
    );

    await waitFor(() => Boolean(full.client.getState().images.items["img-1"]), {
      label: "full client sees image resource",
    });
    await sleep(150);
    assert.equal(
      storyOnly.client.getState().images.items["img-1"],
      undefined,
    );

    await full.client.submitCommand(
      createCommandEnvelope({
        projectId,
        scope: "story",
        type: "scene.create",
        payload: { sceneId: "scene-1", data: { name: "Scene 1" } },
        actor: full.actor,
        clientTs: 3100,
      }),
    );

    await waitFor(
      () => Boolean(storyOnly.client.getState().scenes["scene-1"]),
      {
        label: "story-only client sees story event",
      },
    );
  } finally {
    await full.client.stop();
    await storyOnly.client.stop();
    await harness.server.shutdown();
  }
});

console.log("Integration tests: PASS");
