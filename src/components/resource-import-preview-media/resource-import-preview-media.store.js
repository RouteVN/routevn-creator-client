export const createInitialState = () => ({
  src: undefined,
  kind: "image",
  loading: false,
  loadRequested: false,
  operationId: undefined,
});

export const startLoading = ({ state }, { operationId } = {}) => {
  state.src = undefined;
  state.kind = "image";
  state.loading = true;
  state.loadRequested = true;
  state.operationId = operationId;
};

export const setPreview = ({ state }, { src, kind, operationId } = {}) => {
  if (state.operationId !== operationId) return;
  state.src = src;
  state.kind = kind;
  state.loading = false;
  state.operationId = undefined;
};

export const setLoadFailed = ({ state }, { operationId } = {}) => {
  if (state.operationId !== operationId) return;
  state.loading = false;
  state.operationId = undefined;
};

export const cancelLoading = ({ state }) => {
  state.loading = false;
  state.operationId = undefined;
};

export const selectSrc = ({ state }) => state.src;
export const selectLoadRequested = ({ state }) => state.loadRequested;
export const selectOperationId = ({ state }) => state.operationId;

export const selectViewData = ({ state, props }) => ({
  src: state.src,
  kind: state.kind,
  loading: state.loading,
  label: props.label ?? "",
});
