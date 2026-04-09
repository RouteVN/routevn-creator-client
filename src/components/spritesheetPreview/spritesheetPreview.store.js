export const createInitialState = () => ({
  imageSrc: "",
  ownsImageSrc: false,
  status: "idle",
  animationFrameId: undefined,
  playbackStartedAt: 0,
});

export const setImageSrc = ({ state }, { imageSrc, ownsImageSrc } = {}) => {
  state.imageSrc = imageSrc ?? "";
  state.ownsImageSrc = ownsImageSrc === true;
};

export const setStatus = ({ state }, { status } = {}) => {
  state.status = status ?? "idle";
};

export const setAnimationFrameId = ({ state }, { animationFrameId } = {}) => {
  state.animationFrameId = animationFrameId;
};

export const clearAnimationFrameId = ({ state }) => {
  state.animationFrameId = undefined;
};

export const setPlaybackStartedAt = ({ state }, { playbackStartedAt } = {}) => {
  state.playbackStartedAt = Number.isFinite(playbackStartedAt)
    ? playbackStartedAt
    : 0;
};

export const selectImageSrc = ({ state }) => state.imageSrc;

export const selectOwnsImageSrc = ({ state }) => state.ownsImageSrc;

export const selectStatus = ({ state }) => state.status;

export const selectAnimationFrameId = ({ state }) => state.animationFrameId;

export const selectPlaybackStartedAt = ({ state }) => state.playbackStartedAt;

export const selectViewData = ({ state, props }) => {
  return {
    imageSrc: state.imageSrc,
    status: state.status,
    w: props.w ?? "100%",
    h: props.h ?? "220",
    emptyLabel: props.emptyLabel ?? "No Preview",
  };
};
