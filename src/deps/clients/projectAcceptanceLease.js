import { generateId } from "../../internal/id.js";

const getWindowOwnerId = () => {
  // A renderer reload must reclaim its existing native session lease. Storage
  // is scoped to this window; native desktop commands additionally bind this
  // token to the invoking window label.
  const storage = globalThis.sessionStorage;
  const key = "routevn.projectAcceptanceOwner";
  let id = storage?.getItem(key);
  if (!id) {
    id = generateId();
    storage?.setItem(key, id);
  }
  return id;
};

// Native ownership spans the editable session; the JavaScript queue spans one
// local refresh/validate/persist operation. Network waits occur outside both queues.
export const createNativeProjectAcceptanceLease = async ({
  projectPath,
  acquire,
  release,
}) => {
  const ownerId = getWindowOwnerId();
  const writable = await acquire({ projectPath, ownerId });
  let tail = Promise.resolve();
  let closed = false;
  return {
    writable,
    withLock(operation) {
      const pending = tail.then(() => {
        if (!writable || closed) {
          const error = new Error("This project is open read-only");
          error.code = "project_read_only";
          throw error;
        }
        return operation();
      });
      tail = pending.catch(() => {});
      return pending;
    },
    async close() {
      closed = true;
      await tail;
      if (writable) await release({ projectPath, ownerId });
    },
  };
};
