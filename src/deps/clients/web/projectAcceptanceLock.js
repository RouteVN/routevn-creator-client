export const createWebProjectAcceptanceLease = ({
  databaseName,
  locks = globalThis.navigator?.locks,
}) => {
  const name = `routevn:accept:${databaseName}`;
  return {
    writable: typeof locks?.request === "function",
    withLock(operation) {
      if (!locks?.request) {
        const error = new Error(
          "This browser cannot coordinate project editing",
        );
        error.code = "project_read_only";
        throw error;
      }
      return locks.request(name, { mode: "exclusive" }, operation);
    },
    async close() {},
  };
};
