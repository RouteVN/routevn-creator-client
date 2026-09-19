import assert from "node:assert/strict";
import { test } from "node:test";
import { initialProjectData } from "../src/deps/services/shared/projectRepository.js";
import {
  loadAcceptedState,
  saveAcceptedState,
} from "../src/deps/services/shared/projectRepositoryViews/acceptedStateView.js";
import {
  ACCEPTED_MAIN_VIEW_NAME,
  ACCEPTED_SCENE_VIEW_NAME,
} from "../src/deps/services/shared/projectRepositoryViews/shared.js";

const harness = () => {
  const rows = new Map();
  const key = ({ viewName, partition }) =>
    JSON.stringify([viewName, partition]);
  const store = {
    loadMaterializedViewCheckpoint: async (query) =>
      structuredClone(rows.get(key(query))),
    saveMaterializedViewCheckpoint: async (row) =>
      rows.set(key(row), JSON.parse(JSON.stringify(row))),
  };
  const state = structuredClone(initialProjectData);
  state.scenes.items["scene-one"] = {
    id: "scene-one",
    type: "scene",
    name: "Scene One",
    sections: { items: {}, tree: [] },
  };
  state.scenes.tree.push({ id: "scene-one", children: [] });
  state.layouts.items["layout-one"] = {
    id: "layout-one",
    type: "layout",
    isFragment: undefined,
    name: "Layout One",
  };
  const frontier = {
    storageKey: "project-one",
    projectId: "project-one",
    committedCount: 0,
    latestCommittedId: 0,
    draftCount: 1,
    latestDraftClock: 1,
    digest: "source-one",
  };
  return { rows, store, accepted: { state, frontier } };
};

test("warm cache retains undefined legacy properties through a JSON store and requires outside-project trust", async () => {
  const { rows, store, accepted } = harness();
  const trustedDigest = await saveAcceptedState({
    store,
    accepted,
    now: () => 123,
  });
  assert.deepEqual(
    await loadAcceptedState({
      store,
      frontier: accepted.frontier,
      trustedDigest,
    }),
    { ...accepted, legacyPrefix: undefined },
  );
  assert.equal(
    await loadAcceptedState({ store, frontier: accepted.frontier }),
    undefined,
  );
  const main = [...rows.values()].find(
    (row) => row.viewName === ACCEPTED_MAIN_VIEW_NAME,
  );
  main.value.main.value.layouts.items["layout-one"].name =
    "Corrupted Layout One";
  assert.equal(
    await loadAcceptedState({
      store,
      frontier: accepted.frontier,
      trustedDigest,
    }),
    undefined,
  );
});

test("malformed scene caches are rebuilt and an incomplete manifest never becomes an authority", async () => {
  const { rows, store, accepted } = harness();
  const trustedDigest = await saveAcceptedState({ store, accepted });
  const scene = [...rows.values()].find(
    (row) => row.viewName === ACCEPTED_SCENE_VIEW_NAME,
  );
  scene.value.scene = {};
  assert.equal(
    await loadAcceptedState({
      store,
      frontier: accepted.frontier,
      trustedDigest,
    }),
    undefined,
  );
  const rebuiltDigest = await saveAcceptedState({ store, accepted });
  assert.deepEqual(
    (
      await loadAcceptedState({
        store,
        frontier: accepted.frontier,
        trustedDigest: rebuiltDigest,
      })
    ).state,
    accepted.state,
  );
});
