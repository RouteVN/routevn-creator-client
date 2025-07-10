import { AudioWaveformExtractor } from "../../utils/audioWaveform.js";

export const handleOnMount = (deps) => {
  const { store, render, props } = deps;
  
  if (props.waveformData) {
    store.setWaveformData(props.waveformData);
  }
  
  if (props.duration) {
    store.setDuration(props.duration);
  }
  
  // Delay drawing to ensure DOM is ready
  setTimeout(() => {
    drawWaveform(deps);
  }, 100);
  
  return () => {};
};

export const handlePropsChanged = (deps) => {
  const { store, render, props } = deps;
  
  if (props.waveformData !== store.selectWaveformData()) {
    store.setWaveformData(props.waveformData);
    setTimeout(() => {
      drawWaveform(deps);
    }, 50);
  }
  
  if (props.duration !== store.selectDuration()) {
    store.setDuration(props.duration);
  }
  
  if (props.currentTime !== store.selectCurrentTime()) {
    store.setCurrentTime(props.currentTime || 0);
    setTimeout(() => {
      drawWaveform(deps);
    }, 50);
  }
  
  render();
};

export const handleCanvasClick = (e, deps) => {
  const { dispatchEvent, props } = deps;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const clickRatio = x / canvas.clientWidth;
  const duration = props.duration || 0;
  const seekTime = clickRatio * duration;
  
  dispatchEvent(new CustomEvent('waveform-seek', {
    detail: { time: seekTime }
  }));
};

function drawWaveform(deps) {
  const { store, props } = deps;
  
  // Find canvas using a more robust approach
  const canvases = document.querySelectorAll('canvas[id="waveform-canvas"]');
  const canvas = canvases[canvases.length - 1]; // Get the last (most recent) canvas
  
  if (!canvas) {
    console.warn('Waveform canvas not found');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const waveformData = props.waveformData || store.selectWaveformData();
  
  if (!waveformData) {
    console.warn('No waveform data available');
    return;
  }
  
  let data;
  if (typeof waveformData === 'string') {
    const decompressed = AudioWaveformExtractor.decompressWaveformData(waveformData);
    data = decompressed?.data;
  } else {
    data = waveformData.data;
  }
  
  if (!data || !Array.isArray(data)) {
    console.warn('Invalid waveform data format');
    return;
  }
  
  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;
  
  ctx.clearRect(0, 0, width, height);
  
  ctx.fillStyle = '#e9ecef';
  ctx.strokeStyle = '#007bff';
  ctx.lineWidth = 1;
  
  const barWidth = Math.max(1, width / data.length);
  
  for (let i = 0; i < data.length; i++) {
    const amplitude = data[i];
    const barHeight = amplitude * (height * 0.8);
    const x = i * barWidth;
    const y = centerY - barHeight / 2;
    
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
  }
  
  const currentTime = props.currentTime || store.selectCurrentTime();
  const duration = props.duration || store.selectDuration() || 0;
  
  if (duration > 0 && currentTime >= 0) {
    const progressRatio = currentTime / duration;
    const progressX = progressRatio * width;
    
    ctx.fillStyle = '#007bff';
    for (let i = 0; i < data.length; i++) {
      const x = i * barWidth;
      if (x <= progressX) {
        const amplitude = data[i];
        const barHeight = amplitude * (height * 0.8);
        const y = centerY - barHeight / 2;
        ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
      }
    }
    
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(progressX, 0);
    ctx.lineTo(progressX, height);
    ctx.stroke();
  }
}