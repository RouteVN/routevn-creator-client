import { authorProject } from "./authorProject.mjs";
import { observeRuntime } from "./runtimeObservation.mjs";
import { verifyBrowserDump } from "./browserDumpChecks.mjs";
import {
  encodeIdbValue,
  dumpDatabases,
  restoreDatabases,
} from "./indexedDbDump.mjs";

export function createBrowserLane(api) {
  // The in-process test server expects Node's UTF-8 byte counter. Keep Buffer
  // non-callable so the production browser payload codec still uses Uint8Array.
  globalThis.Buffer = {
    byteLength: (value) => new TextEncoder().encode(value).byteLength,
  };
  const projectId = "project-one";
  const names = [projectId, api.buildClientStoreDbName(projectId)];
  return {
    verifyBrowserDump,
    restore: restoreDatabases,
    dump: () => dumpDatabases(names),
    async clearCaches() {
      for (const name of names) {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const transaction = db.transaction(
            "materialized_view_state",
            "readwrite",
          );
          const done = new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
          });
          transaction.objectStore("materialized_view_state").clear();
          await done;
        } finally {
          db.close();
        }
      }
    },
    async run(mode, recipe) {
      const started = performance.now();
      const raw = await api.createPersistedInMemoryClientStore({ projectId });
      const store = await api.createInsiemeWebStoreAdapter(projectId, {
        rawClientStore: raw,
      });
      if (mode === "capture") {
        const authorStore = {
          ...raw,
          getRepositoryHistoryStats: () => store.getRepositoryHistoryStats(),
        };
        await authorProject({
          api,
          store: authorStore,
          app: store.app,
          recipe,
        });
        for (const file of recipe.assetFiles ?? []) {
          const bytes = Uint8Array.from(atob(file.base64), (character) =>
            character.charCodeAt(0),
          );
          await store.setFile(
            file.id,
            new Blob([bytes], { type: file.mimeType }),
          );
        }
        if (recipe.fault) {
          const drafts = await raw.listDraftsOrdered();
          const id =
            recipe.fault === "invalid-draft"
              ? "command-000003"
              : "command-000001";
          const draft = drafts.find((row) => row.id === id);
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(names[1]);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const transaction = db.transaction(
              ["drafts", "committed"],
              "readwrite",
            );
            const done = new Promise((resolve, reject) => {
              transaction.oncomplete = resolve;
              transaction.onerror = () => reject(transaction.error);
            });
            const objectStore = transaction.objectStore("drafts");
            if (recipe.fault === "duplicate-committed-draft") {
              const request = transaction
                .objectStore("committed")
                .get("command-000001");
              request.onsuccess = () => {
                const row = request.result;
                delete row.committed_id;
                row.draft_clock =
                  Math.max(...drafts.map((row) => row.draftClock)) + 1;
                objectStore.add(row);
              };
            } else if (recipe.fault === "obsolete-line-edit") {
              objectStore.add({
                id: "obsolete-edit-one",
                partition: "s:scene-one",
                type: "line.update_actions",
                schema_version: 1,
                payload: {
                  lineId: "line-one",
                  data: { dialogue: { content: "Obsolete edit" } },
                },
                draft_clock:
                  Math.max(...drafts.map((row) => row.draftClock)) + 1,
                client_ts: 2000,
                created_at: 2000,
              });
            } else {
              const request = objectStore.get(draft.id);
              request.onsuccess = () => {
                const row = request.result;
                if (recipe.fault === "invalid-draft")
                  row.payload.sceneId = "missing-scene";
                else
                  row.schema_version =
                    recipe.fault === "real-version" ? 1.5 : "1junk";
                objectStore.put(row);
              };
            }
            await done;
          } finally {
            db.close();
          }
        }
        return { source: await dumpDatabases(names) };
      }
      const reference = {
        projectId,
        repositoryProjectId: projectId,
        cacheKey: projectId,
      };
      const service = api.createProjectRepositoryService({
        router: { getPayload: () => ({}) },
        db: { get: async () => undefined, set: async () => {} },
        creatorVersion: 2,
        storageAdapter: {
          createAcceptanceLease: async () => ({
            writable: true,
            withLock: (operation) =>
              navigator.locks.request(`routevn:accept:${names[1]}`, operation),
            close: async () => {},
          }),
          resolveProjectReferenceByProjectId: async () => reference,
          createStore: async () => store,
          readCreatorVersionByReference: () => store.app.get("creatorVersion"),
        },
        collabAdapter: {
          beforeCreateRepository: async () => {},
          afterCreateRepository: async () => {},
        },
      });
      const repository = await service.getRepositoryById(projectId);
      // Warm opens use the resolved checkpoint projection, not history replay.
      const openedState = repository.getState();
      const hydratedScenes = {};
      for (const scene of Object.values(openedState.scenes.items)) {
        if (scene.type !== "scene") continue;
        await repository.setActiveSceneId(scene.id);
        const hydrated = repository.getState().scenes.items[scene.id];
        hydratedScenes[scene.id] = hydrated;
        openedState.scenes.items[scene.id] = hydrated;
      }
      const openedRepository = await encodeIdbValue({
        state: openedState,
        runtime: observeRuntime({ state: openedState, ...api }),
      });
      // Keep the original frozen history-only observations independently checked.
      const historyState = await (repository.loadHistoryState?.() ??
        repository.loadState());
      const historyReplay = await encodeIdbValue({
        state: historyState,
        scenes: Object.fromEntries(
          Object.values(historyState.scenes.items)
            .filter((scene) => scene.type === "scene")
            .map((scene) => [scene.id, hydratedScenes[scene.id]]),
        ),
        projectInfo: await service.getProjectInfoByProjectId(projectId),
        platformDetails: await store.app.get("platformDetails.web"),
      });
      await repository.flushMaterializedViews();
      return {
        openedRepository,
        historyReplay,
        historyRuntime: await encodeIdbValue(
          observeRuntime({ state: historyState, ...api }),
        ),
        source: await dumpDatabases(names),
        measurements: { elapsedMs: performance.now() - started },
      };
    },
  };
}
