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
        db: {},
        creatorVersion: 2,
        storageAdapter: {
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
      const state = await repository.loadState();
      const scenes = {};
      for (const scene of Object.values(state.scenes.items)) {
        if (scene.type !== "scene") continue;
        await repository.setActiveSceneId(scene.id);
        scenes[scene.id] = repository.getState().scenes.items[scene.id];
      }
      const observation = await encodeIdbValue({
        state,
        scenes,
        projectInfo: await service.getProjectInfoByProjectId(projectId),
        platformDetails: await store.app.get("platformDetails.web"),
      });
      await repository.flushMaterializedViews();
      return {
        observation,
        runtime: await encodeIdbValue(observeRuntime({ state, ...api })),
        source: await dumpDatabases(names),
        measurements: { elapsedMs: performance.now() - started },
      };
    },
  };
}
