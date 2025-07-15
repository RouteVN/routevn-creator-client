export const handleOnMount = async (deps) => {
  const { attrs, render, getRefIds } = deps;
  
  render();

  const config = {
    x: attrs.x || 0,
    y: attrs.y || 0,
    scale: attrs.scale || 1,
    rotation: attrs.rotation || 0,
    anchor: attrs.anchor || 'top-left',
    zIndex: attrs.zIndex || 0,
  }
  
  const canvas = getRefIds().canvas?.elm;
  if (canvas) {
    renderPlacement(config, canvas);
  }

  render();
};

export const handleOnUpdate = async (changes, deps) => {
  const { attrs, render, getRefIds } = deps;
  
  render();
  
  const canvas = getRefIds().canvas?.elm;
  if (canvas) {
    renderPlacement(attrs.placementConfig, canvas);
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
  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const canvasX = config.x * scaleX;
  const canvasY = config.y * scaleY;
  
  // Calculate placement dimensions and position (scaled to canvas)
  const placementWidth = 300 * config.scale * scaleX;
  const placementHeight = 300 * config.scale * scaleY;
  const anchorSize = 50 * Math.min(scaleX, scaleY);
  
  // Calculate anchor position based on anchor type
  let anchorX, anchorY;
  switch (config.anchor) {
    case 'top-left':
      anchorX = canvasX;
      anchorY = canvasY;
      break;
    case 'top-center':
      anchorX = canvasX - placementWidth / 2;
      anchorY = canvasY;
      break;
    case 'top-right':
      anchorX = canvasX - placementWidth;
      anchorY = canvasY;
      break;
    case 'center-left':
      anchorX = canvasX;
      anchorY = canvasY - placementHeight / 2;
      break;
    case 'center':
      anchorX = canvasX - placementWidth / 2;
      anchorY = canvasY - placementHeight / 2;
      break;
    case 'center-right':
      anchorX = canvasX - placementWidth;
      anchorY = canvasY - placementHeight / 2;
      break;
    case 'bottom-left':
      anchorX = canvasX;
      anchorY = canvasY - placementHeight;
      break;
    case 'bottom-center':
      anchorX = canvasX - placementWidth / 2;
      anchorY = canvasY - placementHeight;
      break;
    case 'bottom-right':
      anchorX = canvasX - placementWidth;
      anchorY = canvasY - placementHeight;
      break;
    default:
      anchorX = canvasX;
      anchorY = canvasY;
  }
  
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