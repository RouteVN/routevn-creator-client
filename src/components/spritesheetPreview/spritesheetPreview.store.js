export const createInitialState = () => ({
  imageSrc: "",
  ownsImageSrc: false,
  status: "idle",
  animationFrameId: undefined,
  playbackStartedAt: 0,
});

const DEFAULT_CHECKER_CELL_SIZE_PX = 12;

const normalizeCheckerCellSize = (value) => {
  const size = Number(value);
  return Number.isFinite(size) && size > 0
    ? Math.round(size)
    : DEFAULT_CHECKER_CELL_SIZE_PX;
};

const parseBooleanProp = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === true || value === "") {
    return true;
  }

  if (value === false) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off" ||
      normalized === "none"
    ) {
      return false;
    }
  }

  return defaultValue;
};

const resolveBorderRadius = (value) => {
  if (value === "none" || value === "0" || value === 0) {
    return {
      br: "md",
      borderRadiusCss: "0px",
    };
  }

  return {
    br: value ?? "md",
    borderRadiusCss: undefined,
  };
};

const buildTransparencyGridStyle = ({
  checkerCellSize,
  borderRadiusCss,
  showCheckerboard,
}) => {
  const style = showCheckerboard
    ? [
        "background-color: #eef2f7",
        "background-image: linear-gradient(45deg, #94a3b8 25%, transparent 25%), linear-gradient(-45deg, #94a3b8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #94a3b8 75%), linear-gradient(-45deg, transparent 75%, #94a3b8 75%)",
        `background-position: 0 0, 0 ${checkerCellSize}px, ${checkerCellSize}px -${checkerCellSize}px, -${checkerCellSize}px 0`,
        "background-repeat: repeat",
        `background-size: ${checkerCellSize * 2}px ${checkerCellSize * 2}px`,
      ]
    : ["background-color: transparent", "background-image: none"];

  if (borderRadiusCss) {
    style.push(`border-radius: ${borderRadiusCss}`);
  }

  return `${style.join("; ")};`;
};

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
  const checkerCellSize = normalizeCheckerCellSize(props.checkerCellSize);
  const showCheckerboard = parseBooleanProp(props.showCheckerboard, true);
  const { br, borderRadiusCss } = resolveBorderRadius(props.br);

  return {
    imageSrc: state.imageSrc,
    status: state.status,
    w: props.w ?? "100%",
    h: props.h ?? "220",
    br,
    transparencyGridStyle: buildTransparencyGridStyle({
      checkerCellSize,
      borderRadiusCss,
      showCheckerboard,
    }),
    emptyLabel: props.emptyLabel ?? "No Preview",
  };
};
