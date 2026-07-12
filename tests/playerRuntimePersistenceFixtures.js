export const cloneFixture = (value) => structuredClone(value);

export const createSaveSlot = (
  slotId = 1,
  { lineId = "line-3", savedAt = 1_700_000_000_000 } = {},
) => ({
  formatVersion: 1,
  slotId,
  savedAt,
  image: null,
  engineMetadata: { compatible: true },
  state: {
    contexts: [
      {
        currentPointerMode: "read",
        pointers: {
          read: {
            sceneId: "scene-1",
            sectionId: "section-1",
            lineId,
          },
        },
        configuration: { locale: "en" },
        views: [{ layoutId: "dialogue" }],
        bgm: { resourceId: "bgm-1" },
        variables: {
          score: 12,
          routeUnlocked: true,
          profile: { name: "Ada", tags: ["reader", null] },
        },
        runtime: {
          saveLoadPagination: 1,
          menuPage: "",
          menuEntryPoint: "",
        },
        rollback: {
          currentIndex: 1,
          isRestoring: false,
          replayStartIndex: 0,
          timeline: [
            {
              sectionId: "section-1",
              lineId: "line-1",
              rollbackPolicy: "free",
            },
            {
              sectionId: "section-1",
              lineId,
              rollbackPolicy: "free",
              executedActions: [
                {
                  type: "pushOverlay",
                  payload: { resourceId: "menu", optional: null },
                },
              ],
            },
          ],
        },
      },
    ],
  },
});

export const createPersistenceState = (overrides = {}) => ({
  saveSlots: {},
  globalDeviceVariables: {},
  globalAccountVariables: {},
  globalRuntime: {},
  accountViewedRegistry: {},
  ...overrides,
});
