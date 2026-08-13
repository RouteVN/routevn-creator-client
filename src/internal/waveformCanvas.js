export const renderWaveformCanvas = ({
  canvas,
  waveformData,
  width,
  height,
}) => {
  if (!canvas || width <= 0 || height <= 0) {
    return;
  }

  const canvasWidth = Math.max(1, Math.round(width));
  const canvasHeight = Math.max(1, Math.round(height));
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#1a1a1a";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const amplitudes = waveformData?.amplitudes;
  if (!amplitudes?.length) {
    return;
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#404040");
  gradient.addColorStop(0.5, "#A1A1A1");
  gradient.addColorStop(1, "#404040");
  context.fillStyle = gradient;

  const barCount = Math.min(canvasWidth, amplitudes.length);
  const samplesPerBar = amplitudes.length / barCount;
  const barWidth = canvasWidth / barCount;
  const centerY = canvasHeight / 2;

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const sampleStart = Math.floor(barIndex * samplesPerBar);
    const sampleEnd = Math.max(
      sampleStart + 1,
      Math.floor((barIndex + 1) * samplesPerBar),
    );
    let amplitude = 0;
    for (
      let sampleIndex = sampleStart;
      sampleIndex < sampleEnd && sampleIndex < amplitudes.length;
      sampleIndex += 1
    ) {
      amplitude = Math.max(amplitude, amplitudes[sampleIndex]);
    }

    const barHeight = (amplitude / 255) * (canvasHeight * 0.85);
    const x = barIndex * barWidth;
    const y = centerY - barHeight / 2;
    context.fillRect(x, y, Math.max(1, barWidth * 0.8), barHeight);
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.1)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, centerY);
  context.lineTo(canvasWidth, centerY);
  context.stroke();
};
