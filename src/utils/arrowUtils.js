import { getSmoothStepPath } from "./smoothstepedge";

/**
 * Calculate arrow data between two points
 * @param {number} sourceX - Source X coordinate
 * @param {number} sourceY - Source Y coordinate
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @returns {Object} Arrow data containing path, dimensions and style
 */
export const drawArrowBetweenPoints = (sourceX, sourceY, targetX, targetY) => {
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
    targetX: x2 + padding,
    targetY: y2 + padding,
  });

  return { path, labelX, labelY, offsetX, offsetY, svgWidth, svgHeight, style };
};

export const drawArrowBetweenScenes = (sourceScene, targetScene) => {
  return drawArrowBetweenPoints(
    sourceScene.x + 120,
    sourceScene.y + 30,
    targetScene.x,
    targetScene.y + 30,
  );
};
