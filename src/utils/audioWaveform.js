export class AudioWaveformExtractor {
  static async extractWaveformData(audioFile, samples = 1000) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const blockSize = Math.floor(channelData.length / samples);
      const waveformData = [];
      
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        const end = start + blockSize;
        let sum = 0;
        
        for (let j = start; j < end && j < channelData.length; j++) {
          sum += Math.abs(channelData[j]);
        }
        
        const average = sum / blockSize;
        waveformData.push(average);
      }
      
      const maxAmplitude = Math.max(...waveformData);
      const normalizedData = waveformData.map(value => value / maxAmplitude);
      
      audioContext.close();
      
      return {
        data: normalizedData,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels
      };
    } catch (error) {
      console.error('Failed to extract waveform data:', error);
      return null;
    }
  }
  
  static async generateWaveformImage(waveformData, width = 600, height = 400) {
    // Maintain 3:2 aspect ratio
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Dark theme background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    if (!waveformData || !waveformData.data) {
      return null;
    }
    
    const data = waveformData.data;
    const centerY = height / 2;
    
    // Create gradient for waveform
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#4CAF50');
    gradient.addColorStop(0.5, '#2196F3');
    gradient.addColorStop(1, '#4CAF50');
    
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Add subtle glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#2196F3';
    
    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }
  
  // Add a smaller version for thumbnails
  static async generateWaveformThumbnail(waveformData) {
    return this.generateWaveformImage(waveformData, 300, 200); // 3:2 ratio
  }
}