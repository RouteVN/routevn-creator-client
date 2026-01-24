// Insieme event store integration
import {
  createRepository,
  toFlatItems,
  toFlatGroups,
  toTreeStructure,
} from "insieme";

// Re-export utility functions from insieme
export { toFlatItems, toFlatGroups, toTreeStructure };

/**
 * Create an insieme repository from a store
 * @param {Object} store - Store with getEvents() and appendEvent()
 * @param {Object} initialState - Initial state for the repository
 * @param {Object} options - Optional configuration
 * @param {number} [options.snapshotInterval=1000] - Auto-save snapshot every N events. Set to 0 to disable.
 * @returns {{init: Function, repository: Object}} Repository wrapper with init
 */
export const createInsiemeRepository = (store, initialState, options = {}) => {
  const { snapshotInterval = 1000 } = options;

  const repository = createRepository({
    originStore: store,
    snapshotInterval,
  });
  let initialized = false;

  return {
    async init() {
      await repository.init({ initialState });
      initialized = true;
    },
    get repository() {
      if (!initialized) {
        throw new Error(
          "InsiemeRepository not initialized. Call init() first.",
        );
      }
      return repository;
    },
  };
};
