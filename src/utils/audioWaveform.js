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