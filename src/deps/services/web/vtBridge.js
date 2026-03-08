const FIXED_CREATED_AT = Date.parse("2024-01-01T00:00:00.000Z");

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const waitFor = async (
  predicate,
  { timeoutMs = 10000, intervalMs = 50 } = {},
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (await predicate()) {
      return;
    }
    await wait(intervalMs);
  }

  throw new Error("Timed out waiting for VT route transition.");
};

const deleteDatabase = async (name) => {
  if (!name) {
    return;
  }

  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};

const matchesPayload = (payload = {}) => {
  const searchParams = new URLSearchParams(globalThis.location.search);
  return Object.entries(payload).every(([key, value]) => {
    return searchParams.get(key) === String(value);
  });
};

const normalizeProjectEntry = ({
  id,
  name = "VT Project",
  description = "Seeded project for visual testing.",
} = {}) => {
  return {
    id,
    name,
    description,
    iconFileId: null,
    createdAt: FIXED_CREATED_AT,
    lastOpenedAt: null,
  };
};

const buildPayload = ({ projectId, payload = {} } = {}) => {
  const nextPayload = { ...payload };
  if (projectId) {
    nextPayload.p = projectId;
  }
  return nextPayload;
};

const waitForRoute = async ({
  route,
  payload,
  waitForSelector,
  timeoutMs,
} = {}) => {
  try {
    await waitFor(
      () => {
        return (
          globalThis.location.pathname === route && matchesPayload(payload)
        );
      },
      { timeoutMs },
    );
  } catch {
    throw new Error(
      `VT navigation did not reach ${route} (current: ${globalThis.location.pathname}${globalThis.location.search})`,
    );
  }

  if (!waitForSelector) {
    return;
  }

  try {
    await waitFor(
      () => {
        return !!document.querySelector(waitForSelector);
      },
      { timeoutMs },
    );
  } catch {
    throw new Error(
      `VT route ${route} did not render selector "${waitForSelector}"`,
    );
  }
};

export const setupVtBridge = ({ appDb, appService, projectService }) => {
  if (globalThis.RTGL_VT_ENABLE !== "1") {
    return;
  }

  globalThis.routevnVt = {
    async reset() {
      const projectEntries = (await appDb.get("projectEntries")) ?? [];
      await appDb.set("projectEntries", []);
      await Promise.allSettled(
        projectEntries.map((entry) => deleteDatabase(entry?.id)),
      );
      return { ok: true };
    },

    async createProject({
      id,
      name,
      description,
      template = "default",
      route,
      payload = {},
      waitForSelector,
      timeoutMs = 10000,
    } = {}) {
      if (!id) {
        throw new Error("routevnVt.createProject requires an id.");
      }

      const currentEntries = (await appDb.get("projectEntries")) ?? [];
      const nextEntries = currentEntries.filter((entry) => entry?.id !== id);

      await deleteDatabase(id);
      await projectService.initializeProject({
        projectId: id,
        template,
      });

      nextEntries.push(
        normalizeProjectEntry({
          id,
          name,
          description,
        }),
      );
      await appDb.set("projectEntries", nextEntries);

      if (route) {
        const nextPayload = buildPayload({ projectId: id, payload });
        appService.navigate(route, nextPayload);
        await waitForRoute({
          route,
          payload: nextPayload,
          waitForSelector,
          timeoutMs,
        });
      }

      return {
        ok: true,
        projectId: id,
      };
    },

    async goToRoute({
      route,
      projectId,
      payload = {},
      waitForSelector,
      timeoutMs = 10000,
    } = {}) {
      if (!route) {
        throw new Error("routevnVt.goToRoute requires a route.");
      }

      const resolvedProjectId = projectId ?? appService.getCurrentProjectId();
      const nextPayload = buildPayload({
        projectId: resolvedProjectId,
        payload,
      });

      appService.navigate(route, nextPayload);
      await waitForRoute({
        route,
        payload: nextPayload,
        waitForSelector,
        timeoutMs,
      });

      return {
        ok: true,
        route,
      };
    },
  };
};
