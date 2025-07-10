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
  
  // Upload waveform data to API Object Storage
  static async uploadWaveformData(waveformData, httpClient, projectId) {
    try {
      const waveformJson = JSON.stringify(waveformData);
      const blob = new Blob([waveformJson], { type: 'application/json' });
      
      const { uploadUrl, fileId } = await httpClient.creator.uploadFile({
        projectId: projectId,
      });

      const response = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        return { fileId, success: true };
      } else {
        console.error("Waveform data upload failed:", response.statusText);
        return { fileId: null, success: false };
      }
    } catch (error) {
      console.error("Failed to upload waveform data:", error);
      return { fileId: null, success: false };
    }
  }

  // Download waveform data from API Object Storage
  static async downloadWaveformData(fileId, httpClient) {
    try {
      const { url } = await httpClient.creator.getFileContent({ 
        fileId: fileId, 
        projectId: 'someprojectId' 
      });
      const response = await fetch(url);
      
      if (response.ok) {
        const waveformData = await response.json();
        return waveformData;
      } else {
        console.error("Failed to download waveform data:", response.statusText);
        return null;
      }
    } catch (error) {
      console.error("Failed to download waveform data:", error);
      return null;
    }
  }
}