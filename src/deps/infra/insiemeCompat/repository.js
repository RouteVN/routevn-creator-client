import {
  set,
  unset,
  treePush,
  treeDelete,
  treeUpdate,
  treeMove,
  init as initAction,
} from "./actions.js";
import { validateEventPayload } from "./validation.js";

/**
 * @typedef {import("./actions.js").SetPayload} SetPayload
 * @typedef {import("./actions.js").UnsetPayload} UnsetPayload
 * @typedef {import("./actions.js").TreePushPayload} TreePushPayload
 * @typedef {import("./actions.js").TreeDeletePayload} TreeDeletePayload
 * @typedef {import("./actions.js").TreeUpdatePayload} TreeUpdatePayload
 * @typedef {import("./actions.js").TreeMovePayload} TreeMovePayload
 * @typedef {import("./actions.js").InitPayload} InitPayload
 */

/**
 * @typedef {SetPayload | UnsetPayload | TreePushPayload | TreeDeletePayload | TreeUpdatePayload | TreeMovePayload | InitPayload} RepositoryEventPayload
 */

/**
 * @typedef {"set"|"unset"|"treePush"|"treeDelete"|"treeUpdate"|"treeMove"|"init"} RepositoryEventType
 */

/**
 * @typedef {Object} RepositoryEvent
 * @property {RepositoryEventType} type
 * @property {RepositoryEventPayload} payload
 * @property {string} [partition] - Optional partition identifier
 */

/**
 * @typedef {Record<string, unknown>} RepositoryState
 */

/**
 * @typedef {Object} RepositoryStore
 * @property {(payload?: { partition?: string, since?: number }) => Promise<RepositoryEvent[]|undefined>} getEvents
 * @property {(event: RepositoryEvent) => Promise<void>} appendEvent
 * @property {() => Promise<Snapshot|null>} [getSnapshot] - Optional snapshot retrieval
 * @property {(snapshot: Snapshot) => Promise<void>} [setSnapshot] - Optional snapshot persistence
 */

/**
 * @typedef {Object} Snapshot
 * @property {RepositoryState} state - The state at the time of snapshot
 * @property {number} eventIndex - Number of events included in this snapshot
 * @property {number} createdAt - Timestamp when snapshot was created
 */

/**
 * Creates an internal repository instance with event sourcing and checkpointing.
 * Manages state through an append-only log with periodic checkpoints for performance.
 *
 * @param {{ originStore: RepositoryStore, usingCachedEvents?: boolean, snapshotInterval?: number }} options - Repository options
 * @param {RepositoryStore} options.originStore - The store for persisting events
 * @param {boolean} [options.usingCachedEvents=true] - Whether to use cached events in memory
 * @param {number} [options.snapshotInterval=1000] - Number of events between automatic snapshots
 * @returns {{ init: (options?: { initialState?: RepositoryState, partition?: string }) => Promise<void>, addEvent: (event: RepositoryEvent) => Promise<void>, getState: (untilEventIndex?: number) => RepositoryState, getEvents: () => RepositoryEvent[], getEventsAsync: (payload?: object) => Promise<RepositoryEvent[]>, getStateAsync: (options?: {partition?: string, untilEventIndex?: number}) => Promise<RepositoryState>, saveSnapshot: () => Promise<void> }} Repository API
 *
 * @private This is an internal function used by factory functions
 */
export const createRepository = ({
  originStore,
  usingCachedEvents = true,
  snapshotInterval = 1000,
}) => {
  /** @type {RepositoryStore} */
  const store = originStore;
  const CHECKPOINT_INTERVAL = 50;
  const SNAPSHOT_INTERVAL = snapshotInterval;

  /** @type {RepositoryEvent[]} */
  let cachedEvents = [];
  /** @type {Map<number, RepositoryState>} */
  const checkpoints = usingCachedEvents ? new Map() : null;
  /** @type {number[]} */
  const checkpointIndexes = usingCachedEvents ? [] : null;

  let latestComputedIndex = 0;
  /** @type {RepositoryState} */
  let initialState = {};
  /** @type {RepositoryState} */
  let latestState = structuredClone(initialState);

  // Track the event index of the last saved snapshot
  let snapshotEventIndex = 0;

  /**
   * Stores a checkpoint at the specified action index.
   * Used for performance optimization to avoid replaying all events.
   *
   * @param {number} index - The action index to checkpoint
   * @param {Object} state - The state to checkpoint
   */
  /**
   * @param {number} index
   * @param {RepositoryState} state
   * @returns {void}
   */
  const storeCheckpoint = (index, state) => {
    if (!checkpoints) return;
    if (!checkpoints.has(index)) {
      checkpointIndexes.push(index);
    }
    checkpoints.set(index, state);
  };

  /**
   * Resets all checkpoints and recomputed state.
   * Used during initialization to start from a clean state.
   */
  /** @returns {void} */
  const resetCheckpoints = () => {
    if (!checkpoints) {
      latestComputedIndex = 0;
      latestState = structuredClone(initialState);
      return;
    }

    checkpoints.clear();
    checkpointIndexes.length = 0;
    latestComputedIndex = 0;
    latestState = structuredClone(initialState);
    storeCheckpoint(0, latestState);
  };

  /**
   * Applies an action to the current state and returns the new state.
   * Central dispatcher for all supported action types.
   *
   * @param {Object} state - The current state
   * @param {Object} action - The action to apply
   * @param {string} action.actionType - Type of action (set, unset, treePush, etc.)
   * @param {Object} action.payload - Action payload containing all action-specific data
   * @returns {Object} New state after applying the action
   */
  /**
   * @param {RepositoryState} state
   * @param {RepositoryEvent} event
   * @returns {RepositoryState}
   */
  const applyEventToState = (state, event) => {
    const { type, payload } = event;
    if (type === "set") {
      return set(state, payload);
    } else if (type === "unset") {
      return unset(state, payload);
    } else if (type === "treePush") {
      return treePush(state, payload);
    } else if (type === "treeDelete") {
      return treeDelete(state, payload);
    } else if (type === "treeUpdate") {
      return treeUpdate(state, payload);
    } else if (type === "treeMove") {
      return treeMove(state, payload);
    } else if (type === "init") {
      return initAction(state, payload);
    }
    return state;
  };

  /**
   * Initializes the repository by loading all events from storage.
   * Replays events to reconstruct current state and creates checkpoints.
   *
   * @param {{ initialState?: RepositoryState, partition?: string }} [options] - Initialization options
   * @param {RepositoryState} [options.initialState] - Optional initial state to set if no events exist
   * @param {string} [options.partition] - Optional partition identifier for the repository
   * @returns {Promise<void>}
   */
  const init = async ({
    initialState: providedInitialState,
    partition,
  } = {}) => {
    resetCheckpoints();
    snapshotEventIndex = 0;

    if (usingCachedEvents) {
      // Try to load snapshot first (if store supports it)
      let snapshot = null;
      if (store.getSnapshot) {
        snapshot = await store.getSnapshot();
      }

      if (snapshot) {
        // Clear checkpoints from reset and start fresh from snapshot
        checkpoints.clear();
        checkpointIndexes.length = 0;

        // Initialize from snapshot
        latestState = structuredClone(snapshot.state);
        snapshotEventIndex = snapshot.eventIndex;
        latestComputedIndex = snapshot.eventIndex;
        storeCheckpoint(latestComputedIndex, latestState);

        // Load only events since snapshot (if store supports 'since' parameter)
        const newEvents =
          (await store.getEvents({ since: snapshot.eventIndex })) || [];

        // If store doesn't support 'since' parameter, fallback to loading all and slicing
        if (newEvents.length === 0 && snapshot.eventIndex > 0) {
          const allEvents = (await store.getEvents()) || [];
          cachedEvents = allEvents.slice(snapshot.eventIndex);
        } else {
          cachedEvents = newEvents;
        }
      } else {
        // No snapshot - load all events (existing behavior)
        cachedEvents = (await store.getEvents()) || [];
      }

      // Process cached events to rebuild state (either all, or just since snapshot)
      cachedEvents.forEach((event, index) => {
        latestState = applyEventToState(latestState, event);
        latestComputedIndex = snapshotEventIndex + index + 1;

        if (latestComputedIndex % CHECKPOINT_INTERVAL === 0) {
          // Store reference to current latestState as checkpoint
          storeCheckpoint(latestComputedIndex, latestState);
        }
      });
    } else {
      // For non-cached mode, don't load or cache events in memory
      cachedEvents = null;
    }

    if (
      checkpoints &&
      latestComputedIndex !== 0 &&
      !checkpoints.has(latestComputedIndex)
    ) {
      storeCheckpoint(latestComputedIndex, latestState);
    }

    // If there are no events and no snapshot and initial state is provided, create an init event
    const hasEvents = usingCachedEvents ? cachedEvents.length > 0 : false;
    const hasSnapshot = snapshotEventIndex > 0;

    if (!hasEvents && !hasSnapshot && providedInitialState) {
      const initEvent = {
        type: "init",
        partition,
        payload: {
          value: providedInitialState,
        },
      };

      if (usingCachedEvents) {
        cachedEvents.push(initEvent);
      }
      latestState = applyEventToState(latestState, initEvent);
      latestComputedIndex += 1;

      storeCheckpoint(latestComputedIndex, latestState);
      await store.appendEvent(initEvent);
    }

    // Check if we should save a snapshot after init
    await maybeSaveSnapshot();
  };

  /**
   * Adds a new action to the event log and updates the current state.
   * Persists the action to storage and creates checkpoints periodically.
   *
   * @param {Object} action - The action to add to the event log
   * @returns {Promise<void>}
   */
  /**
   * @param {RepositoryEvent} event
   * @returns {Promise<void>}
   */
  const addEvent = async (event) => {
    // Validate that init events are not allowed through addEvent
    if (event.type === "init") {
      throw new Error(
        "Init events can only be created through repository.init()",
      );
    }

    // Validate event payload against schema
    validateEventPayload(event.type, event.payload);

    // Event now includes partition field directly
    const internalEvent = {
      type: event.type,
      payload: event.payload,
      partition: event.partition,
    };

    if (usingCachedEvents) {
      cachedEvents.push(internalEvent);
      latestState = applyEventToState(latestState, internalEvent);
      latestComputedIndex += 1;

      if (latestComputedIndex % CHECKPOINT_INTERVAL === 0) {
        storeCheckpoint(latestComputedIndex, latestState);
      }
    }

    await store.appendEvent(internalEvent);

    // Check if we should save a snapshot
    await maybeSaveSnapshot();
  };

  /**
   * Checks if a snapshot should be saved based on the interval.
   * Only saves if the store supports snapshots.
   *
   * @returns {Promise<void>}
   */
  const maybeSaveSnapshot = async () => {
    if (!store.setSnapshot) return;

    const eventsSinceSnapshot = latestComputedIndex - snapshotEventIndex;

    if (eventsSinceSnapshot >= SNAPSHOT_INTERVAL) {
      await saveSnapshot();
    }
  };

  /**
   * Saves a snapshot of the current state.
   * Only saves if the store supports snapshots.
   *
   * @returns {Promise<void>}
   */
  const saveSnapshot = async () => {
    if (!store.setSnapshot) return;

    const snapshot = {
      state: structuredClone(latestState),
      eventIndex: latestComputedIndex,
      createdAt: Date.now(),
    };

    await store.setSnapshot(snapshot);
    snapshotEventIndex = latestComputedIndex;
  };

  /**
   * Finds the best checkpoint index to use for reconstructing state.
   * Returns the most recent checkpoint that is at or before the target index.
   *
   * @param {number} targetIndex - The target action index
   * @returns {number} The checkpoint index to start from
   */
  /**
   * @param {number} targetIndex
   * @returns {number}
   */
  const findCheckpointIndex = (targetIndex) => {
    if (!checkpointIndexes || checkpointIndexes.length === 0) return 0;
    for (let i = checkpointIndexes.length - 1; i >= 0; i--) {
      if (checkpointIndexes[i] <= targetIndex) {
        return checkpointIndexes[i];
      }
    }
    // No checkpoint at or before targetIndex, return earliest available
    return checkpointIndexes[0];
  };

  /**
   * Gets the state at a specific point in time, or the current state.
   * Uses checkpoints for efficient state reconstruction.
   * Only available when usingCachedEvents=true.
   *
   * @param {{partition?: string, untilEventIndex?: number}} [options] - State options
   * @param {number} [options.untilEventIndex] - Get state up to specific action index (exclusive)
   *
   * @example
   * const currentState = getState();
   * const historicalState = getState(10); // State after first 10 actions
   *
   * @returns {RepositoryState}
   */
  const getState = (options = {}) => {
    if (!usingCachedEvents) {
      throw new Error(
        "getState is only available when usingCachedEvents=true. " +
          "Use getStateAsync() instead.",
      );
    }

    const { untilEventIndex } = options;

    // Use latestComputedIndex as the max (accounts for snapshot offset)
    const targetIndex =
      untilEventIndex !== undefined
        ? Math.max(0, Math.min(untilEventIndex, latestComputedIndex))
        : latestComputedIndex;

    if (targetIndex === latestComputedIndex) {
      return structuredClone(latestState);
    }

    const checkpointIndex = findCheckpointIndex(targetIndex);
    let state = structuredClone(checkpoints.get(checkpointIndex));

    // Events in cachedEvents are offset by snapshotEventIndex
    // Event at absolute index i is at cachedEvents[i - snapshotEventIndex]
    for (let i = checkpointIndex; i < targetIndex; i++) {
      const eventArrayIndex = i - snapshotEventIndex;
      if (eventArrayIndex >= 0 && eventArrayIndex < cachedEvents.length) {
        state = applyEventToState(state, cachedEvents[eventArrayIndex]);
      }
    }

    return state;
  };

  /**
   * Gets all events from the cached action stream.
   * Returns the complete event log for the repository.
   *
   * @returns {Array<Object>} Array of all actions in chronological order
   */
  /** @returns {RepositoryEvent[]} */
  const getEvents = () => {
    return cachedEvents;
  };

  /**
   * Gets events asynchronously from the origin store.
   * Delegates to the store's getEvents method for fetching events with optional filtering.
   *
   * @param {object} [payload] - Optional payload for filtering events
   * @param {string} [payload.partition] - Partition identifier to get events for specific partition
   * @returns {Promise<RepositoryEvent[]>} Array of events from the store
   * @example
   * // Get all events
   * const allEvents = await getEventsAsync();
   *
   * // Get events for specific partition
   * const partitionEvents = await getEventsAsync({ partition: "user-123" });
   */
  const getEventsAsync = async (payload) => {
    return await store.getEvents(payload);
  };

  /**
   * Gets the state asynchronously, designed for non-cached mode.
   * This is memory-efficient for large datasets as it doesn't require caching all events.
   *
   * @param {{partition?: string, untilEventIndex?: number}} [options] - State options
   * @param {string} [options.partition] - Partition identifier for partition-specific state
   * @param {number} [options.untilEventIndex] - Get state up to specific action index (exclusive)
   * @returns {Promise<RepositoryState>} The computed state
   * @throws {Error} If usingCachedEvents=true - use getState() instead
   */
  const getStateAsync = async (options = {}) => {
    if (usingCachedEvents) {
      throw new Error(
        "getStateAsync is only available when usingCachedEvents=false. Use getState() instead.",
      );
    }

    const { partition, untilEventIndex } = options;

    let events;
    if (partition) {
      // Get partition events
      events = await getEventsAsync({ partition });
    } else {
      // Get all events
      events = await getEventsAsync();
    }

    // Apply untilEventIndex filter if specified
    const targetIndex =
      untilEventIndex !== undefined
        ? Math.max(0, Math.min(untilEventIndex, events.length))
        : events.length;

    const limitedEvents = events.slice(0, targetIndex);

    // Compute state from events
    let state = {};
    for (const event of limitedEvents) {
      state = applyEventToState(state, event);
    }

    return state;
  };

  return {
    init,
    addEvent,
    getState,
    getEvents,
    getEventsAsync,
    getStateAsync,
    saveSnapshot,
  };
};
