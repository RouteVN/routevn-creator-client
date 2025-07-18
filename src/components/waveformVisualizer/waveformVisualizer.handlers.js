export const handleAfterMount = async (deps) => {
  const { attrs, store, render, getRefIds, httpClient, downloadWaveformData } =
    deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  store.setLoading(true);
  store.setError(false);
  render();

  try {
    // Download waveform data from API Object Storage
    const waveformData = await downloadWaveformData(
      attrs.waveformDataFileId,
      httpClient,
    );

    if (!waveformData) {
      store.setError(true);
      store.setLoading(false);
      render();
      return;
    }

    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();

    // Get canvas element and render waveform
    const canvas = getRefIds().canvas?.elm;
    if (canvas) {
      await renderWaveform(waveformData, canvas);
    }
  } catch (error) {
    store.setError(true);
    store.setLoading(false);
    render();
  }
};

export const handleOnUpdate = async (changes, deps) => {
  const { attrs, store, render, getRefIds, httpClient, downloadWaveformData } =
    deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  store.setLoading(true);
  store.setError(false);
  render();

  try {
    // Download waveform data from API Object Storage
    const waveformData = await downloadWaveformData(
      attrs.waveformDataFileId,
      httpClient,
    );

    if (!waveformData) {
      store.setError(true);
      store.setLoading(false);
      render();
      return;
    }

    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();

    // Get canvas element and render waveform
    const canvas = getRefIds().canvas?.elm;
    if (canvas) {
      await renderWaveform(waveformData, canvas);
    }
  } catch (error) {
    store.setError(true);
    store.setLoading(false);
    render();
  }
};

async function renderWaveform(waveformData, canvas) {
  const ctx = canvas.getContext("2d");

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
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, width, height);

  if (!waveformData || !waveformData.data) {
    return;
  }

  const data = waveformData.data;
  const centerY = height / 2;

  // Create gradient for waveform
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#404040");
  gradient.addColorStop(0.5, "#A1A1A1");
  gradient.addColorStop(1, "#404040");

  // Draw waveform bars
  const barWidth = Math.max(1, width / data.length);
  const barSpacing = 0.2; // 20% spacing between bars

  for (let i = 0; i < data.length; i++) {
    const amplitude = data[i];
    const barHeight = amplitude * (height * 0.85);
    const x = i * barWidth;
    const y = centerY - barHeight / 2;

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, Math.max(1, barWidth * (1 - barSpacing)), barHeight);
  }

  // Draw subtle center line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  // Add subtle glow effect
  ctx.shadowBlur = 10;
  ctx.shadowColor = "#2196F3";
}
