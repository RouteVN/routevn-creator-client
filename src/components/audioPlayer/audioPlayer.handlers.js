import { calculations } from './audioPlayer.store.js';

// 生成组件 ID
const generateComponentId = () =>
  `audio-player-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// 获取音频 URL
const getAudioUrl = async (fileId, httpClient) => {
  const { url } = await httpClient.creator.getFileContent({
    fileId,
    projectId: 'someprojectId'
  });
  return url;
};

export const handleOnMount = async (deps) => {
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay } = attrs;

  // 生成组件 ID
  const componentId = generateComponentId();
  store.setComponentId(componentId);

  // 初始化 AudioManager
  audioManager.init();

  // 设置事件监听器
  const listeners = [];

  // 监听时间更新
  const handleTimeUpdate = (currentTime) => {
    store.setCurrentTime(currentTime);
    render();
  };
  audioManager.on('timeupdate', handleTimeUpdate);
  listeners.push(['timeupdate', handleTimeUpdate]);

  // 监听播放状态
  const handlePlay = () => {
    store.setPlaying(true);
    render();
  };
  audioManager.on('play', handlePlay);
  listeners.push(['play', handlePlay]);

  // 监听暂停状态
  const handlePause = () => {
    store.setPlaying(false);
    render();
  };
  audioManager.on('pause', handlePause);
  listeners.push(['pause', handlePause]);

  // 监听播放结束
  const handleEnded = () => {
    store.setPlaying(false);
    store.setCurrentTime(0);
    render();
  };
  audioManager.on('ended', handleEnded);
  listeners.push(['ended', handleEnded]);

  // 监听加载完成
  const handleLoaded = ({ duration }) => {
    store.setDuration(duration);
    store.setLoading(false);
    render();
  };
  audioManager.on('loaded', handleLoaded);
  listeners.push(['loaded', handleLoaded]);

  // 监听错误
  const handleError = (error) => {
    console.error('Audio error:', error);
    store.setLoading(false);
    render();
  };
  audioManager.on('error', handleError);
  listeners.push(['error', handleError]);

  // 保存监听器以便清理
  store.setEventListeners(listeners);

  // 加载音频文件
  if (fileId) {
    try {
      store.setLoading(true);
      render();

      const url = await getAudioUrl(fileId, httpClient);
      await audioManager.loadAudio(url);

      // 自动播放
      if (autoPlay) {
        await audioManager.play();
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      store.setLoading(false);
      render();
    }
  }

  // 清理函数
  return () => {
    // 移除事件监听
    const eventListeners = store.getState().eventListeners;
    eventListeners.forEach(([event, handler]) => {
      audioManager.off(event, handler);
    });

    // 清理 AudioManager
    audioManager.cleanup();
    
    // 重置状态
    store.resetState();
  };
};

export const handleOnUpdate = async (prevProps, deps) => {
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay } = attrs;

  // 如果 fileId 改变，重新加载音频
  if (prevProps.fileId !== fileId && fileId) {
    try {
      store.setLoading(true);
      render();

      // 停止当前播放
      audioManager.stop();

      // 加载新音频
      const url = await getAudioUrl(fileId, httpClient);
      await audioManager.loadAudio(url);

      // 自动播放
      if (autoPlay) {
        await audioManager.play();
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      store.setLoading(false);
      render();
    }
  }
};

export const handlePlayPause = async (e, deps) => {
  e.preventDefault();
  const { audioManager } = deps;

  if (audioManager.isPlaying()) {
    audioManager.pause();
  } else {
    await audioManager.play();
  }
};

export const handleProgressBarClick = (e, deps) => {
  const { store, audioManager } = deps;
  const state = store.getState();

  if (!state.duration) return;

  // 计算点击位置
  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const seekTime = calculations.calculateSeekPosition(clickX, rect.width, state.duration);

  // 跳转到指定时间
  audioManager.seek(seekTime);
};

export const handleClose = (e, deps) => {
  e.preventDefault();
  const { dispatchEvent, audioManager } = deps;

  // 停止播放
  audioManager.stop();

  // 发送关闭事件
  dispatchEvent(new CustomEvent("audio-player-close", {
    bubbles: true,
    composed: true
  }));
};