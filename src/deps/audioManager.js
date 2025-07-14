/**
 * AudioManager - 纯音频管理服务
 * 
 * 职责：
 * - 管理 Web Audio API
 * - 控制音频播放
 * - 发送状态变化事件
 * - 不依赖任何 UI 组件
 */

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
    
    // Timer
    this.updateTimer = null;
    
    // Event listeners
    this.listeners = new Map();
  }

  // 初始化音频上下文
  init() {
    if (this.audioContext) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    
    // 创建增益节点
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  // 清理资源
  cleanup() {
    this.stop();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    
    this.audioContext = null;
    this.gainNode = null;
    this.audioBuffer = null;
    this.listeners.clear();
  }

  // 加载音频
  async loadAudio(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.duration = this.audioBuffer.duration;
      
      // 重置播放状态
      this.currentTime = 0;
      this.pauseTime = 0;
      
      const audioInfo = { duration: this.duration };
      this.emit('loaded', audioInfo);
      
      return audioInfo;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  // 播放音频
  async play(fromTime = null) {
    if (!this.audioBuffer || this.playing) return;
    
    // 恢复音频上下文（某些浏览器需要）
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // 停止当前源节点
    this._stopSourceNode();
    
    // 创建新的源节点
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode);
    
    // 设置结束处理
    this.sourceNode.onended = () => {
      if (this.playing) {
        this._handlePlaybackEnd();
      }
    };
    
    // 计算开始时间
    const startOffset = fromTime !== null ? fromTime : this.pauseTime;
    this.startTime = this.audioContext.currentTime - startOffset;
    
    // 开始播放
    this.sourceNode.start(0, startOffset);
    this.playing = true;
    
    // 开始时间更新
    this._startTimeUpdate();
    
    this.emit('play');
  }

  // 暂停播放
  pause() {
    if (!this.playing) return;
    
    this._stopSourceNode();
    this.playing = false;
    this.pauseTime = this.currentTime;
    
    this._stopTimeUpdate();
    
    this.emit('pause');
  }

  // 停止播放
  stop() {
    if (!this.playing && this.currentTime === 0) return;
    
    this._stopSourceNode();
    this.playing = false;
    this.currentTime = 0;
    this.pauseTime = 0;
    
    this._stopTimeUpdate();
    
    this.emit('pause');
  }

  // 跳转到指定时间
  seek(time) {
    const seekTime = Math.max(0, Math.min(time, this.duration));
    this.currentTime = seekTime;
    this.pauseTime = seekTime;
    
    if (this.playing) {
      // 如果正在播放，重新开始
      this.pause();
      this.play(seekTime);
    }
    
    this.emit('timeupdate', this.currentTime);
  }

  // 设置音量 (0-1)
  setVolume(volume) {
    if (!this.gainNode) return;
    
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.gainNode.gain.value = clampedVolume;
  }

  // 获取当前时间
  getCurrentTime() {
    return this.currentTime;
  }

  // 获取持续时间
  getDuration() {
    return this.duration;
  }

  // 是否正在播放
  isPlaying() {
    return this.playing;
  }

  // 是否已加载音频
  isLoaded() {
    return this.audioBuffer !== null;
  }

  // 获取音量
  getVolume() {
    return this.gainNode ? this.gainNode.gain.value : 1;
  }

  // 事件监听
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  // 移除事件监听
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  // 发送事件
  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // 私有方法：停止源节点
  _stopSourceNode() {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        this.sourceNode.stop();
      } catch (error) {
        // 源节点可能已经停止
      }
      this.sourceNode = null;
    }
  }

  // 私有方法：开始时间更新
  _startTimeUpdate() {
    this._stopTimeUpdate();
    
    this.updateTimer = setInterval(() => {
      if (!this.playing || !this.audioContext) return;
      
      const elapsed = this.audioContext.currentTime - this.startTime;
      this.currentTime = Math.min(elapsed, this.duration);
      
      this.emit('timeupdate', this.currentTime);
      
      // 检查是否接近结束
      if (this.currentTime >= this.duration - 0.1) {
        this._handlePlaybackEnd();
      }
    }, 100);
  }

  // 私有方法：停止时间更新
  _stopTimeUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // 私有方法：处理播放结束
  _handlePlaybackEnd() {
    this.stop();
    this.emit('ended');
  }
}