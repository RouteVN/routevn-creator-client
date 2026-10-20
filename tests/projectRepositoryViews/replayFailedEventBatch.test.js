import { describe, expect, it, vi } from "vitest";
import { replayFailedEventBatch } from "../../src/deps/services/shared/projectRepositoryViews/shared.js";

const createEvent = (id, flags = {}) => ({ id, ...flags });

const createValidationError = (message, commandIndex) => {
  const error = new Error(message);
  if (commandIndex !== undefined) {
    error.details = { commandIndex };
  }
  return error;
};

// Applies events in order. An `invalid` event fails with its index in
// `events` when `reportIndex` is set. A run that ends with an
// `invalidAtEnd` event fails a check of the final state, with no index.
const createReduceEventsToState = ({ reportIndex = true } = {}) =>
  vi.fn(({ repositoryState, events }) => {
    const applied = [...repositoryState.applied];
    events.forEach((event, index) => {
      if (event.invalid) {
        throw createValidationError(
          `invalid event ${event.id}`,
          reportIndex ? index : undefined,
        );
      }
      applied.push(event.id);
    });
    if (events.at(-1)?.invalidAtEnd) {
      throw createValidationError("invalid final state");
    }
    return { applied };
  });

// Skips `invalid` events and throws for `fatal` ones.
const createReplayEvent = () =>
  vi.fn(({ repositoryState, event }) => {
    if (event.fatal) {
      throw createValidationError(`fatal event ${event.id}`);
    }
    if (event.invalid) {
      return repositoryState;
    }
    return { applied: [...repositoryState.applied, event.id] };
  });

const replayBatch = ({ events, reduceEventsToState, replayEvent }) => {
  const repositoryState = { applied: [] };
  let error;
  try {
    reduceEventsToState({ repositoryState, events });
  } catch (batchError) {
    error = batchError;
  }
  reduceEventsToState.mockClear();

  return replayFailedEventBatch({
    repositoryState,
    events,
    error,
    reduceEventsToState,
    replayEvent,
  });
};

const toRunIds = (reduceEventsToState) =>
  reduceEventsToState.mock.calls.map(([{ events }]) =>
    events.map(({ id }) => id),
  );

const toReplayedEvents = (replayEvent) =>
  replayEvent.mock.calls.map(([{ event, index }]) => [event.id, index]);

describe("replayFailedEventBatch", () => {
  it("replays the events around each failed event together", () => {
    const reduceEventsToState = createReduceEventsToState();
    const replayEvent = createReplayEvent();

    const state = replayBatch({
      events: [
        createEvent("a"),
        createEvent("b"),
        createEvent("x", { invalid: true }),
        createEvent("c"),
        createEvent("y", { invalid: true }),
        createEvent("d"),
      ],
      reduceEventsToState,
      replayEvent,
    });

    expect(state.applied).toEqual(["a", "b", "c", "d"]);
    expect(toRunIds(reduceEventsToState)).toEqual([
      ["a", "b"],
      ["c", "y", "d"],
      ["c"],
      ["d"],
    ]);
    expect(toReplayedEvents(replayEvent)).toEqual([
      ["x", 2],
      ["y", 4],
    ]);
  });

  it("replays a failed first or last event without an empty run", () => {
    const reduceEventsToState = createReduceEventsToState();
    const replayEvent = createReplayEvent();

    const state = replayBatch({
      events: [
        createEvent("x", { invalid: true }),
        createEvent("a"),
        createEvent("y", { invalid: true }),
      ],
      reduceEventsToState,
      replayEvent,
    });

    expect(state.applied).toEqual(["a"]);
    expect(toRunIds(reduceEventsToState)).toEqual([["a", "y"], ["a"]]);
    expect(toReplayedEvents(replayEvent)).toEqual([
      ["x", 0],
      ["y", 2],
    ]);
  });

  it("replays one event at a time without a failed event index", () => {
    const reduceEventsToState = createReduceEventsToState({
      reportIndex: false,
    });
    const replayEvent = createReplayEvent();

    const state = replayBatch({
      events: [
        createEvent("a"),
        createEvent("x", { invalid: true }),
        createEvent("b"),
      ],
      reduceEventsToState,
      replayEvent,
    });

    expect(state.applied).toEqual(["a", "b"]);
    expect(reduceEventsToState).not.toHaveBeenCalled();
    expect(toReplayedEvents(replayEvent)).toEqual([
      ["a", 0],
      ["x", 1],
      ["b", 2],
    ]);
  });

  it("replays one event at a time when the index is outside the events", () => {
    const reduceEventsToState = createReduceEventsToState();
    const replayEvent = createReplayEvent();
    const events = [createEvent("a"), createEvent("b")];

    const state = replayFailedEventBatch({
      repositoryState: { applied: [] },
      events,
      error: createValidationError("invalid event", events.length),
      reduceEventsToState,
      replayEvent,
    });

    expect(state.applied).toEqual(["a", "b"]);
    expect(reduceEventsToState).not.toHaveBeenCalled();
    expect(toReplayedEvents(replayEvent)).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("replays the rest one at a time when the events before a failed event fail together", () => {
    const reduceEventsToState = createReduceEventsToState();
    const replayEvent = createReplayEvent();

    const state = replayBatch({
      events: [
        createEvent("a"),
        createEvent("x", { invalid: true }),
        createEvent("b"),
        createEvent("c", { invalidAtEnd: true }),
        createEvent("y", { invalid: true }),
        createEvent("d"),
      ],
      reduceEventsToState,
      replayEvent,
    });

    expect(state.applied).toEqual(["a", "b", "c", "d"]);
    expect(toRunIds(reduceEventsToState)).toEqual([
      ["a"],
      ["b", "c", "y", "d"],
      ["b", "c"],
    ]);
    expect(toReplayedEvents(replayEvent)).toEqual([
      ["x", 1],
      ["b", 2],
      ["c", 3],
      ["y", 4],
      ["d", 5],
    ]);
  });

  it("stops at an event that replayEvent throws for", () => {
    const reduceEventsToState = createReduceEventsToState();
    const replayEvent = createReplayEvent();

    expect(() =>
      replayBatch({
        events: [
          createEvent("a"),
          createEvent("x", { invalid: true, fatal: true }),
          createEvent("b"),
        ],
        reduceEventsToState,
        replayEvent,
      }),
    ).toThrow("fatal event x");
    expect(toRunIds(reduceEventsToState)).toEqual([["a"]]);
    expect(toReplayedEvents(replayEvent)).toEqual([["x", 1]]);
  });
});
