import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
  VIEW_CHECKPOINT,
  createMainProjectionState,
  isMainPartition,
  isMainScenePartition,
} from "./shared.js";

export const createMainStateViewDefinition = ({
  createInitialState,
  reduceEventToState,
}) => ({
  name: MAIN_VIEW_NAME,
  version: MAIN_VIEW_VERSION,
  checkpoint: VIEW_CHECKPOINT,
  initialState: () => createMainProjectionState(createInitialState()),
  matchPartition: ({ loadedPartition, eventPartition }) =>
    loadedPartition === MAIN_PARTITION &&
    (isMainPartition(eventPartition) || isMainScenePartition(eventPartition)),
  reduce: ({ state, event }) => {
    const nextState = reduceEventToState({
      repositoryState: state,
      event,
    });
    return createMainProjectionState(nextState);
  },
});
