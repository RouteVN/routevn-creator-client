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
  
  static async generateWaveformImage(waveformData, width = 800, height = 120) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    if (!waveformData || !waveformData.data) {
      return null;
    }
    
    const data = waveformData.data;
    const centerY = height / 2;
    
    // Draw waveform
    ctx.fillStyle = '#007bff';
    ctx.strokeStyle = '#0056b3';
    
    const barWidth = Math.max(1, width / data.length);
    
    for (let i = 0; i < data.length; i++) {
      const amplitude = data[i];
      const barHeight = amplitude * (height * 0.8);
      const x = i * barWidth;
      const y = centerY - barHeight / 2;
      
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
    
    // Draw center line
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }
  
  static compressWaveformData(waveformData) {
    return JSON.stringify(waveformData);
  }
  
  static decompressWaveformData(compressedData) {
    try {
      return JSON.parse(compressedData);
    } catch (error) {
      console.error('Failed to decompress waveform data:', error);
      return null;
    }
  }
}