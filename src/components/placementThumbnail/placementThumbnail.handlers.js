export const handleOnMount = (deps) => {
  const { attrs, render, getRefIds } = deps;
  
  render();

  const config = {
    x: attrs.x || 0,
    y: attrs.y || 0,
    scaleX: attrs.scaleX || 1,
    scaleY: attrs.scaleY || 1,
    rotation: attrs.rotation || 0,
    anchorX: attrs.anchorX || 0,
    anchorY: attrs.anchorY || 0,
    zIndex: attrs.zIndex || 0,
  }
  
  const canvas = getRefIds().canvas?.elm;
  if (canvas) {
    renderPlacement(config, canvas);
  }

  render();
};

export const handleOnUpdate = (changes, deps) => {
  const { attrs, render, getRefIds } = deps;
  
  render();

  const config = {
    x: attrs.x || 0,
    y: attrs.y || 0,
    scaleX: attrs.scaleX || 1,
    scaleY: attrs.scaleY || 1,
    rotation: attrs.rotation || 0,
    anchorX: attrs.anchorX || 0,
    anchorY: attrs.anchorY || 0,
    zIndex: attrs.zIndex || 0,
  }
  
  const canvas = getRefIds().canvas?.elm;
  if (canvas) {
    renderPlacement(config, canvas);
  }

  render();
};

function renderPlacement(config, canvas) {
  const ctx = canvas.getContext('2d');
  
  // Get the actual display size of the canvas
  const rect = canvas.getBoundingClientRect();
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  
  // Set canvas internal resolution to match display size
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Dark theme background
  ctx.fillStyle = '#4A4A4A';
  ctx.fillRect(0, 0, width, height);
  
  // Convert coordinates from 1920x1080 reference to canvas dimensions
  // TODO: get it from acutal config.
  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const canvasX = config.x * scaleX;
  const canvasY = config.y * scaleY;
  
  // Calculate placement dimensions and position (scaled to canvas)
  const placementWidth = 300 * config.scaleX * scaleX;
  const placementHeight = 300 * config.scaleY * scaleY;
  const anchorSize = 50 * Math.min(scaleX, scaleY);
  
  // Calculate actual anchor position using anchorX and anchorY (0-1 normalized values)
  const anchorOffsetX = placementWidth * config.anchorX;
  const anchorOffsetY = placementHeight * config.anchorY;
  
  // Position where the placement should be drawn (top-left corner)
  const anchorX = canvasX - anchorOffsetX;
  const anchorY = canvasY - anchorOffsetY;
  
  // Save context for rotation
  ctx.save();
  
  // Apply rotation around the anchor point
  if (config.rotation !== 0) {
    ctx.translate(canvasX, canvasY);
    ctx.rotate(config.rotation * Math.PI / 180);
    ctx.translate(-canvasX, -canvasY);
  }
  
  // Draw main placement body (larger gray square)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(anchorX, anchorY, placementWidth, placementHeight);
  
  // Draw border for the main body
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.strokeRect(anchorX, anchorY, placementWidth, placementHeight);
  
  // Restore context
  ctx.restore();
  
  // Draw anchor point (small red square) - always at the anchor position, not rotated
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(
    canvasX - anchorSize / 2,
    canvasY - anchorSize / 2,
    anchorSize,
    anchorSize
  );
}