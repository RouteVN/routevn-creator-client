import { getSmoothStepPath } from "./smoothstepedge";

const sceneWidth = 120;
const sceneHeight = 60;

const getSceneAnchorPoint = (scene) => {
  return {
    top: { x: scene.x + sceneWidth / 2, y: scene.y },
    bottom: { x: scene.x + sceneWidth / 2, y: scene.y + sceneHeight },
    left: { x: scene.x, y: scene.y + sceneHeight / 2 },
    right: { x: scene.x + sceneWidth, y: scene.y + sceneHeight / 2 },
    center: { x: scene.x + sceneWidth / 2, y: scene.y + sceneHeight / 2 },
  };
};

const getRelativePosition = (pos1, pos2) => {
  const rel_x = pos2.x - pos1.x;
  const rel_y = pos2.y - pos1.y;
  if (rel_y > rel_x && rel_y > -rel_x) {
    return "bottom";
  } else if (rel_y < rel_x && rel_y < -rel_x) {
    return "top";
  } else if (rel_y <= rel_x && rel_y >= -rel_x) {
    return "right";
  } else {
    return "left";
  }
};

/**
 * Calculate arrow data between two points
 * @param {number} sourceX - Source X coordinate
 * @param {number} sourceY - Source Y coordinate
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @returns {Object} Arrow data containing path, dimensions and style
 */
export const drawArrowBetweenPoints = (
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
) => {
  const padding = 30; // Add padding to ensure the arrow is not cut off

  const originY = Math.min(sourceY, targetY) - padding;
  const originX = Math.min(sourceX, targetX) - padding;

  const style = `position: absolute; top: ${originY}px; left: ${originX}px; z-index: 1;`;

  const x1 = sourceX < targetX ? 0 : sourceX - targetX;
  const y1 = sourceY < targetY ? 0 : sourceY - targetY;
  const x2 = sourceX < targetX ? targetX - sourceX : 0;
  const y2 = sourceY < targetY ? targetY - sourceY : 0;

  const svgWidth = Math.abs(x1 - x2) + padding * 2;
  const svgHeight = Math.abs(y1 - y2) + padding * 2;

  const [path, labelX, labelY, offsetX, offsetY] = getSmoothStepPath({
    sourceX: x1 + padding,
    sourceY: y1 + padding,
    sourcePosition,
    targetX: x2 + padding,
    targetY: y2 + padding,
    targetPosition,
  });

  return { path, labelX, labelY, offsetX, offsetY, svgWidth, svgHeight, style };
};

export const drawArrowBetweenScenes = (sourceScene, targetScene) => {
  const sourceAnchorPoints = getSceneAnchorPoint(sourceScene);
  const targetAnchorPoints = getSceneAnchorPoint(targetScene);

  const sourcePosition = getRelativePosition(
    sourceAnchorPoints.center,
    targetAnchorPoints.center,
  );
  const targetPosition = getRelativePosition(
    targetAnchorPoints.center,
    sourceAnchorPoints.center,
  );

  return drawArrowBetweenPoints(
    sourceAnchorPoints[sourcePosition].x,
    sourceAnchorPoints[sourcePosition].y,
    sourcePosition,
    targetAnchorPoints[targetPosition].x,
    targetAnchorPoints[targetPosition].y,
    targetPosition,
  );
};
