import { readFixtureJson } from "./fixtureIO.mjs";
import { observeRuntime } from "./runtimeObservation.mjs";
import { authorProject } from "./authorProject.mjs";
// Run in a fresh process with nativeHooks.mjs. Never import application code
// from the harness checkout: root selects a separately installed pinned reader.
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { encodeValue, readSourceRecords } from "./records.mjs";

const [rootArg, mode, projectPath, recipePath, outputPath] =
  process.argv.slice(2);
const root = resolve(rootArg);
const load = (path) => import(pathToFileURL(join(root, path)));
const { createPersistedTauriProjectStore } = await load(
  "src/deps/services/tauri/collabClientStore.js",
);
const { createProjectRepositoryService } = await load(
  "src/deps/services/shared/projectRepositoryService.js",
);
const modules = await Promise.all(
  [
    "src/deps/services/shared/projectRepository.js",
    "src/deps/services/shared/collab/clientStoreHistory.js",
    "src/deps/services/shared/collab/createProjectCollabService.js",
    "src/deps/services/shared/collab/partitions.js",
    "node_modules/insieme/src/server.js",
    "scripts/collabTestSupport.js",
    "src/internal/project/projection.js",
    "src/internal/project/routeEngineProjectData.js",
  ].map(load),
);
const api = Object.assign({}, ...modules);
const { default: createRouteEngine } = await load(
  "node_modules/route-engine-js/dist/RouteEngine.js",
);
const recipe = readFixtureJson(recipePath);
const projectId = "project-one";
let store;
const started = performance.now();
try {
  await mkdir(projectPath, { recursive: true });
  store = await createPersistedTauriProjectStore({ projectPath, projectId });
  if (mode === "capture") {
    await authorProject({ api, store, app: store.app, recipe });
    if (recipe.assetFiles) {
      await mkdir(join(projectPath, "files"), { recursive: true });
      for (const file of recipe.assetFiles)
        await writeFile(
          join(projectPath, "files", file.id),
          Buffer.from(file.base64, "base64"),
        );
    }
    await store.close();
    store = undefined;
    await writeFile(
      outputPath,
      JSON.stringify(
        { sourceRecords: readSourceRecords(join(projectPath, "project.db")) },
        null,
        2,
      ) + "\n",
    );
  } else {
    const reference = {
      projectPath,
      cacheKey: projectPath,
      projectId,
      repositoryProjectId: projectId,
    };
    const service = createProjectRepositoryService({
      router: { getPayload: () => ({}) },
      db: { get: async () => undefined, set: async () => {} },
      creatorVersion: 2,
      storageAdapter: {
        createAcceptanceLease: async () => ({
          writable: true,
          withLock: (operation) => operation(),
          close: async () => {},
        }),
        resolveProjectReferenceByProjectId: async () => reference,
        createStore: async () => store,
        readCreatorVersionByReference: async () =>
          store.app.get("creatorVersion"),
      },
      collabAdapter: {
        beforeCreateRepository: async () => {},
        afterCreateRepository: async () => {},
      },
    });
    const repository = await service.getRepositoryById(projectId);
    // Opening may recover a project whose surviving history cannot replay it.
    // Enumerate the resolved main projection, then hydrate every recovered scene.
    const openedState = repository.getState();
    const hydratedScenes = {};
    for (const scene of Object.values(openedState.scenes.items)) {
      if (scene.type !== "scene") continue;
      await repository.setActiveSceneId(scene.id);
      const hydrated = repository.getState().scenes.items[scene.id];
      hydratedScenes[scene.id] = hydrated;
      openedState.scenes.items[scene.id] = hydrated;
    }
    const openedRepository = encodeValue({
      state: openedState,
      runtime: observeRuntime({
        state: openedState,
        ...api,
        createRouteEngine,
      }),
    });
    // Preserve the original history-only oracle as a separate observation.
    const historyState = await (repository.loadHistoryState?.() ??
      repository.loadState());
    const historyScenes = Object.fromEntries(
      Object.values(historyState.scenes.items)
        .filter((scene) => scene.type === "scene")
        .map((scene) => [scene.id, hydratedScenes[scene.id]]),
    );
    const historyReplay = encodeValue({
      state: historyState,
      scenes: historyScenes,
      projectInfo: await service.getProjectInfoByProjectId(projectId),
      platformDetails: await store.app.get("platformDetails.web"),
    });
    const historyRuntime = encodeValue(
      observeRuntime({ state: historyState, ...api, createRouteEngine }),
    );
    await repository.flushMaterializedViews();
    await store.close();
    store = undefined;
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          openedRepository,
          historyReplay,
          historyRuntime,
          sourceRecords: readSourceRecords(join(projectPath, "project.db")),
          measurements: {
            elapsedMs: performance.now() - started,
            maxRssKiB: process.resourceUsage().maxRSS,
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
} catch (error) {
  if (
    mode !== "read" ||
    !recipe.expectedFailure ||
    error.code !== recipe.expectedFailure.code ||
    error.message !== recipe.expectedFailure.message
  )
    throw error;
  if (store) {
    await store.close();
    store = undefined;
  }
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        historyReplay: encodeValue({
          error: { code: error.code, message: error.message },
        }),
        sourceRecords: readSourceRecords(join(projectPath, "project.db")),
        measurements: {
          elapsedMs: performance.now() - started,
          maxRssKiB: process.resourceUsage().maxRSS,
        },
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  if (store) await store.close();
}
