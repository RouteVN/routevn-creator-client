/**
 * Audio Service - handles audio playback using Web Audio API
 */
export const createAudioService = () => {
  // Audio context and nodes
  let audioContext = null;
  let sourceNode = null;
  let gainNode = null;
  let audioBuffer = null;

  // State
  let playing = false;
  let currentTime = 0;
  let duration = 0;
  let startTime = 0;
  let pauseTime = 0;
  let timeOffset = 0;

  // Timer
  let updateTimer = null;

  // Event listeners
  const listeners = new Map();

  const emit = (event, ...args) => {
    if (listeners.has(event)) {
      listeners.get(event).forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  };

  const stopSourceNode = () => {
    if (sourceNode) {
      try {
        sourceNode.onended = null;
        sourceNode.disconnect();
        sourceNode.stop();
      } catch {}
      sourceNode = null;
    }
  };

  const stopTimeUpdate = () => {
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  };

  const handlePlaybackEnd = () => {
    service.stop();
    emit("ended");
  };

  const startTimeUpdate = () => {
    stopTimeUpdate();

    updateTimer = setInterval(() => {
      if (!playing || !audioContext) return;

      const elapsed = audioContext.currentTime - startTime;
      const calculatedTime = timeOffset + elapsed;
      const clampedTime = Math.max(0, Math.min(calculatedTime, duration));

      if (clampedTime >= 0 && clampedTime <= duration) {
        currentTime = clampedTime;
        emit("timeupdate", currentTime);
      }

      if (currentTime >= duration - 0.1) {
        handlePlaybackEnd();
      }
    }, 100);
  };

  const service = {
    init() {
      if (audioContext) return;

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();

      gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
    },

    cleanup() {
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close();
      }

      audioContext = null;
      gainNode = null;
      audioBuffer = null;
    },

    async loadAudio(url) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        duration = audioBuffer.duration;

        currentTime = 0;
        pauseTime = 0;

        const audioInfo = { duration };
        emit("loaded", audioInfo);

        return audioInfo;
      } catch (error) {
        emit("error", error);
        throw error;
      }
    },

    async play(fromTime = null) {
      if (!audioBuffer || playing) return;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      stopSourceNode();

      sourceNode = audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(gainNode);

      sourceNode.onended = () => {
        if (playing) {
          handlePlaybackEnd();
        }
      };

      const startOffset = fromTime !== null ? fromTime : pauseTime;
      startTime = audioContext.currentTime;
      timeOffset = startOffset;

      sourceNode.start(0, startOffset);
      playing = true;

      startTimeUpdate();

      emit("play");
    },

    pause() {
      if (!playing) return;

      stopSourceNode();
      playing = false;
      pauseTime = currentTime;

      stopTimeUpdate();

      emit("pause");
    },

    stop() {
      if (!playing && currentTime === 0) return;

      stopSourceNode();
      playing = false;
      currentTime = 0;
      pauseTime = 0;
      timeOffset = 0;

      stopTimeUpdate();

      emit("pause");
    },

    async seek(time) {
      if (!audioBuffer || !duration) return;

      const seekTime = Math.max(0, Math.min(time, duration));
      const wasPlaying = playing;

      currentTime = seekTime;
      pauseTime = seekTime;

      if (wasPlaying) {
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        stopSourceNode();
        stopTimeUpdate();

        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(gainNode);

        sourceNode.onended = () => {
          if (playing) {
            handlePlaybackEnd();
          }
        };

        startTime = audioContext.currentTime;
        timeOffset = seekTime;
        sourceNode.start(0, seekTime);

        startTimeUpdate();
      }

      emit("timeupdate", currentTime);
    },

    setVolume(volume) {
      if (!gainNode) return;

      const clampedVolume = Math.max(0, Math.min(1, volume));
      gainNode.gain.value = clampedVolume;
    },

    getCurrentTime() {
      return currentTime;
    },

    getDuration() {
      return duration;
    },

    isPlaying() {
      return playing;
    },

    isLoaded() {
      return audioBuffer !== null;
    },

    getVolume() {
      return gainNode ? gainNode.gain.value : 1;
    },

    on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(callback);
    },

    off(event, callback) {
      if (listeners.has(event)) {
        listeners.get(event).delete(callback);
      }
    },
  };

  return service;
};
