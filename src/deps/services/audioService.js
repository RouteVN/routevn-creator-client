import { decodeAudioBuffer } from "../clients/audioDecoder.js";

/**
 * Audio Service - handles audio playback using Web Audio API
 */
export const createAudioService = ({
  createAudioContext,
  createAudioOutput,
} = {}) => {
  // Audio context and nodes
  let audioContext = null;
  let sourceNode = null;
  let gainNode = null;
  let audioBuffer = null;
  let audioOutput;
  let playbackRequestId = 0;

  // State
  let playing = false;
  let currentTime = 0;
  let duration = 0;
  let startTime = 0;
  let pauseTime = 0;
  let timeOffset = 0;

  // Timer
  let updateTimer = null;
  let activeOwnerCount = 0;
  let loadRequestId = 0;
  let loadAbortController;

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

  const shutdown = () => {
    playbackRequestId += 1;
    audioOutput?.close();
    audioOutput = undefined;
    loadRequestId += 1;
    loadAbortController?.abort();
    loadAbortController = undefined;
    stopSourceNode();
    stopTimeUpdate();

    playing = false;
    currentTime = 0;
    duration = 0;
    startTime = 0;
    pauseTime = 0;
    timeOffset = 0;
    audioBuffer = null;

    const context = audioContext;
    audioContext = null;
    gainNode = null;

    if (context && context.state !== "closed") {
      try {
        void context.close();
      } catch {}
    }
  };

  const resumeAudio = async (context, output, requestId) => {
    const isCurrent = () =>
      context === audioContext &&
      output === audioOutput &&
      requestId === playbackRequestId;
    try {
      // Start both requests in the user gesture, before yielding to a promise.
      await Promise.all([
        context.state === "suspended" ? context.resume() : undefined,
        output?.resume(),
      ]);
      return isCurrent();
    } catch (error) {
      if (isCurrent()) {
        service.pause();
        emit("error", error);
      }
      return false;
    }
  };

  const service = {
    init() {
      if (audioContext) return;

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      audioContext = createAudioContext
        ? createAudioContext()
        : new AudioContextClass();

      audioOutput = createAudioOutput?.(audioContext);
      gainNode = audioContext.createGain();
      gainNode.connect(audioOutput?.destination ?? audioContext.destination);
    },

    acquire() {
      service.init();
      activeOwnerCount += 1;
      let released = false;

      return () => {
        if (released) {
          return;
        }

        released = true;
        activeOwnerCount = Math.max(0, activeOwnerCount - 1);
        if (activeOwnerCount === 0) {
          shutdown();
        }
      };
    },

    async unlock() {
      service.init();

      await resumeAudio(audioContext, audioOutput, playbackRequestId);
    },

    cleanup() {
      activeOwnerCount = 0;
      shutdown();
    },

    async loadAudio(url) {
      if (activeOwnerCount === 0) {
        return undefined;
      }

      // Replacement players can mount before the previous owner releases.
      service.stop();
      service.init();
      const context = audioContext;
      const requestId = ++loadRequestId;
      loadAbortController?.abort();
      const abortController = new AbortController();
      loadAbortController = abortController;
      const isActiveRequest = () =>
        activeOwnerCount > 0 &&
        requestId === loadRequestId &&
        context === audioContext &&
        !abortController.signal.aborted;

      try {
        const response = await fetch(url, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!isActiveRequest()) {
          return undefined;
        }

        const decodedAudioBuffer = await decodeAudioBuffer({
          audioContext: context,
          arrayBuffer,
        });
        if (!isActiveRequest()) {
          return undefined;
        }

        audioBuffer = decodedAudioBuffer;
        duration = decodedAudioBuffer.duration;

        currentTime = 0;
        pauseTime = 0;

        const audioInfo = { duration };
        emit("loaded", audioInfo);

        return audioInfo;
      } catch (error) {
        if (!isActiveRequest()) {
          return undefined;
        }

        emit("error", error);
        throw error;
      } finally {
        if (loadAbortController === abortController) {
          loadAbortController = undefined;
        }
      }
    },

    async play(fromTime = null) {
      const context = audioContext;
      const outputGainNode = gainNode;
      const output = audioOutput;
      const buffer = audioBuffer;
      if (!buffer || playing || !context || !outputGainNode) return;
      const requestId = ++playbackRequestId;

      if (context.state === "suspended" || output) {
        if (!(await resumeAudio(context, output, requestId))) return;
      }

      if (
        context !== audioContext ||
        outputGainNode !== gainNode ||
        buffer !== audioBuffer ||
        playing
      ) {
        return;
      }

      stopSourceNode();

      sourceNode = context.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.connect(outputGainNode);

      sourceNode.onended = () => {
        if (playing) {
          handlePlaybackEnd();
        }
      };

      const startOffset = fromTime !== null ? fromTime : pauseTime;
      startTime = context.currentTime;
      timeOffset = startOffset;

      sourceNode.start(0, startOffset);
      playing = true;

      startTimeUpdate();

      emit("play");
    },

    pause() {
      playbackRequestId += 1;
      // Pause the media transport first: a live stream left running after its
      // source stops can repeat buffered audio on older iOS WebKit.
      audioOutput?.pause();
      if (!playing) return;

      stopSourceNode();
      playing = false;
      pauseTime = currentTime;

      stopTimeUpdate();

      emit("pause");
    },

    stop() {
      playbackRequestId += 1;
      audioOutput?.pause();
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
      const context = audioContext;
      const outputGainNode = gainNode;
      if (!audioBuffer || !duration || !context || !outputGainNode) return;

      const seekTime = Math.max(0, Math.min(time, duration));
      const wasPlaying = playing;
      const requestId = ++playbackRequestId;

      // Publish the released position before waiting for native output. The old
      // source's timer/end event must not overwrite it while output resumes.
      stopTimeUpdate();
      if (sourceNode) sourceNode.onended = null;
      currentTime = seekTime;
      pauseTime = seekTime;
      emit("timeupdate", currentTime);

      if (wasPlaying) {
        if (requestId !== playbackRequestId) return;
        const output = audioOutput;
        if (context.state === "suspended" || output) {
          if (!(await resumeAudio(context, output, requestId))) return;
        }

        if (
          requestId !== playbackRequestId ||
          context !== audioContext ||
          outputGainNode !== gainNode
        ) {
          return;
        }

        stopSourceNode();

        sourceNode = context.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(outputGainNode);

        sourceNode.onended = () => {
          if (playing) {
            handlePlaybackEnd();
          }
        };

        startTime = context.currentTime;
        timeOffset = seekTime;
        sourceNode.start(0, seekTime);

        startTimeUpdate();
      }
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
