export default class AudioManager {
  constructor() {
    // Audio context and nodes
    this.audioContext = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.audioBuffer = null;

    // State
    this.playing = false;
    this.currentTime = 0;
    this.duration = 0;
    this.startTime = 0;
    this.pauseTime = 0;
    this.timeOffset = 0;

    // Timer
    this.updateTimer = null;

    // Event listeners
    this.listeners = new Map();
  }

  init() {
    if (this.audioContext) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();

    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  cleanup() {
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }

    this.audioContext = null;
    this.gainNode = null;
    this.audioBuffer = null;
  }

  async loadAudio(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.duration = this.audioBuffer.duration;

      this.currentTime = 0;
      this.pauseTime = 0;

      const audioInfo = { duration: this.duration };
      this.emit("loaded", audioInfo);

      return audioInfo;
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  async play(fromTime = null) {
    if (!this.audioBuffer || this.playing) return;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this._stopSourceNode();

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);

    this.sourceNode.onended = () => {
      if (this.playing) {
        this._handlePlaybackEnd();
      }
    };

    const startOffset = fromTime !== null ? fromTime : this.pauseTime;
    this.startTime = this.audioContext.currentTime;
    this.timeOffset = startOffset;

    this.sourceNode.start(0, startOffset);
    this.playing = true;

    this._startTimeUpdate();

    this.emit("play");
  }

  pause() {
    if (!this.playing) return;

    this._stopSourceNode();
    this.playing = false;
    this.pauseTime = this.currentTime;

    this._stopTimeUpdate();

    this.emit("pause");
  }

  stop() {
    if (!this.playing && this.currentTime === 0) return;

    this._stopSourceNode();
    this.playing = false;
    this.currentTime = 0;
    this.pauseTime = 0;
    this.timeOffset = 0;

    this._stopTimeUpdate();

    this.emit("pause");
  }

  async seek(time) {
    if (!this.audioBuffer || !this.duration) return;

    const seekTime = Math.max(0, Math.min(time, this.duration));
    const wasPlaying = this.playing;

    this.currentTime = seekTime;
    this.pauseTime = seekTime;

    if (wasPlaying) {
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this._stopSourceNode();
      this._stopTimeUpdate();

      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.sourceNode.connect(this.gainNode);

      this.sourceNode.onended = () => {
        if (this.playing) {
          this._handlePlaybackEnd();
        }
      };

      this.startTime = this.audioContext.currentTime;
      this.timeOffset = seekTime;
      this.sourceNode.start(0, seekTime);

      this._startTimeUpdate();
    }

    this.emit("timeupdate", this.currentTime);
  }

  setVolume(volume) {
    if (!this.gainNode) return;

    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.gainNode.gain.value = clampedVolume;
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.duration;
  }

  isPlaying() {
    return this.playing;
  }

  isLoaded() {
    return this.audioBuffer !== null;
  }

  getVolume() {
    return this.gainNode ? this.gainNode.gain.value : 1;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  _stopSourceNode() {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.disconnect();
        this.sourceNode.stop();
      } catch (error) {}
      this.sourceNode = null;
    }
  }

  _startTimeUpdate() {
    this._stopTimeUpdate();

    this.updateTimer = setInterval(() => {
      if (!this.playing || !this.audioContext) return;

      const elapsed = this.audioContext.currentTime - this.startTime;
      const calculatedTime = this.timeOffset + elapsed;
      const clampedTime = Math.max(0, Math.min(calculatedTime, this.duration));

      if (clampedTime >= 0 && clampedTime <= this.duration) {
        this.currentTime = clampedTime;
        this.emit("timeupdate", this.currentTime);
      }

      if (this.currentTime >= this.duration - 0.1) {
        this._handlePlaybackEnd();
      }
    }, 100);
  }

  _stopTimeUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  _handlePlaybackEnd() {
    this.stop();
    this.emit("ended");
  }
}
