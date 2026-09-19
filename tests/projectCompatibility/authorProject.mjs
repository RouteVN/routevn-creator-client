// Shared synthetic authoring recipe, executed against the selected old writer.
// api contains that checkout's production exports, never candidate reducers.
export async function authorProject({ api, store, app, recipe }) {
  const {
    createProjectCreateCommand,
    createRepositoryCommandEvent,
    initialProjectData,
    applyCommandToRepositoryState,
    toBootstrappedDraftEvent,
    createProjectCollabService,
    scenePartitionFor,
    mainScenePartitionFor,
    createInMemorySyncStore,
    createSyncServer,
    createOfflineTransport,
    validateCommandSubmitItem,
    createInMemoryServerTransport,
  } = api;
  const projectId = "project-one";
  const actor = { userId: "actor-one", clientId: "client-one" };
  let session;
  let server;
  const protocolErrors = [];
  try {
    const commands = [
      createProjectCreateCommand({
        projectId,
        state: recipe.initialState ?? initialProjectData,
        actor,
        commandId: "bootstrap-one",
        clientTs: 1000,
      }),
      ...recipe.commands.map((command, index) => ({
        ...command,
        id: `command-${String(index + 1).padStart(6, "0")}`,
        projectId,
        actor,
        partition: "m",
        clientTs: 1001 + index,
        schemaVersion: 1,
      })),
    ];
    const serverStore = createInMemorySyncStore();
    server = createSyncServer({
      auth: {
        verifyToken: async () => ({
          clientId: actor.clientId,
          claims: { userId: actor.userId },
        }),
      },
      authz: {
        authorizeProject: async (_identity, requestedId) =>
          requestedId === projectId,
      },
      store: serverStore,
      validation: { validate: async (item) => validateCommandSubmitItem(item) },
      clock: { now: () => Date.now() },
      limits: { maxInboundMessagesPerWindow: 100000 },
      logger: (entry) => {
        if (entry.event === "session_closed" || entry.level === "error")
          protocolErrors.push(entry);
      },
    });
    const count =
      recipe.history === "committed"
        ? commands.length
        : recipe.history === "mixed"
          ? Math.ceil(commands.length / 2)
          : 0;
    let transport = createOfflineTransport();
    if (count)
      await transport.setOnlineTransport(
        createInMemoryServerTransport({
          server,
          connectionId: "connection-one",
        }),
      );
    session = createProjectCollabService({
      projectId,
      actor,
      token: "synthetic-token",
      clientStore: count && !recipe.acknowledgeLocalDrafts ? undefined : store,
      transport,
    });
    if (recipe.bootstrapMode !== "native-initializer") await session.start();
    const receiveCommittedPrefix = async () => {
      await session.stop();
      transport = createOfflineTransport();
      await transport.setOnlineTransport(
        createInMemoryServerTransport({ server, connectionId: "receiver-one" }),
      );
      session = createProjectCollabService({
        projectId,
        actor,
        token: "synthetic-token",
        clientStore: store,
        transport,
      });
      await session.start();
      await session.syncNow({ timeoutMs: 5000 });
      const deadline = performance.now() + 5000;
      while ((await store.getRepositoryHistoryStats()).committedCount < count) {
        if (performance.now() > deadline)
          throw new Error("Committed prefix did not arrive");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await transport.setOffline();
    };
    let repositoryState = structuredClone(initialProjectData);
    for (const [index, command] of commands.entries()) {
      if (index === count && count > 0) await receiveCommittedPrefix();
      if (command.type.startsWith("scene.") && command.payload.sceneId)
        command.partition = mainScenePartitionFor(command.payload.sceneId);
      if (command.type.startsWith("section.") && command.payload.sceneId)
        command.partition = mainScenePartitionFor(command.payload.sceneId);
      if (command.type.startsWith("line.")) {
        for (const scene of Object.values(repositoryState.scenes.items)) {
          const sections = Object.values(scene.sections?.items ?? {});
          if (
            sections.some(
              (section) =>
                section.id === command.payload.sectionId ||
                section.lines.items[command.payload.lineId] ||
                command.payload.lineIds?.some((id) => section.lines.items[id]),
            )
          )
            command.partition = scenePartitionFor(scene.id);
        }
      }
      const applied = applyCommandToRepositoryState({
        repositoryState,
        command,
      });
      if (!applied.valid)
        throw new Error(`${command.type}: ${JSON.stringify(applied.error)}`);
      repositoryState = applied.repositoryState;
      const submitted =
        index === 0 && recipe.bootstrapMode === "native-initializer"
          ? (await store.insertDraft(
              toBootstrappedDraftEvent(
                createRepositoryCommandEvent({ command }),
                0,
              ),
            ),
            { valid: true })
          : await session.submitCommand(command);
      if (!submitted.valid) throw new Error(JSON.stringify(submitted.error));
      if (index < count) {
        await session.flushDrafts();
        await session.syncNow({ timeoutMs: 5000 });
        const deadline = performance.now() + 5000;
        while (
          (recipe.acknowledgeLocalDrafts
            ? (await store.getRepositoryHistoryStats()).committedCount
            : await serverStore.getMaxCommittedIdForProject({ projectId })) <
          index + 1
        ) {
          if (performance.now() > deadline)
            throw new Error(`Acknowledgment did not persist: ${command.id}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
    }
    if (count === commands.length && !recipe.acknowledgeLocalDrafts)
      await receiveCommittedPrefix();
    // Exercise the real acknowledgment promotion path, never rewrite row tables
    // to pretend that a locally authored draft came from committed history.
    const history = await store.getRepositoryHistoryStats();
    if (
      history.committedCount !== count ||
      history.draftCount !== commands.length - count
    )
      throw new Error(
        `Unexpected captured history: ${JSON.stringify(history)}`,
      );
    await app.set("creatorVersion", 2);
    await app.set("projectInfo", {
      id: projectId,
      namespace: "project-one",
      nativeApplicationIdentifier: "com.example.projectone",
      name: "Project One",
      description: "Synthetic compatibility fixture",
      language: "en",
      iconFileId: null,
    });
    await app.set("platformDetails.web", { title: "Project One" });
    await session.stop();
    session = undefined;
  } catch (error) {
    error.message += `; protocol errors: ${JSON.stringify(protocolErrors)}`;
    throw error;
  } finally {
    if (session) await session.stop();
    if (server) await server.shutdown();
  }
}
