


/**
 * 
 */
export default class AudioManager {
  constructor() {
    this.players = new Map(); // Map of componentId -> { store, render, updateInterval }
  }

  registerPlayer(componentId, store, render) {
    this.players.set(componentId, { store, render, updateInterval: null });
  }

  unregisterPlayer(componentId) {
    const player = this.players.get(componentId);
    if (player && player.updateInterval) {
      clearInterval(player.updateInterval);
    }
    this.players.delete(componentId);
  }

  startTimeUpdates(componentId) {
    const player = this.players.get(componentId);
    if (!player) return;

    if (player.updateInterval) {
      clearInterval(player.updateInterval);
    }

    player.updateInterval = setInterval(() => {
      const state = player.store.getState();
      
      if (!state.isPlaying || state.isSeeking) {
        return;
      }
      
      // Check if audio context and source are still valid
      if (!state.audioContext || !state.sourceNode) {
        this.stopTimeUpdates(componentId);
        return;
      }
      
      const elapsed = state.audioContext.currentTime - state.startTime;
      const currentTime = Math.min(elapsed, state.duration);
      
      player.store.setCurrentTime(currentTime);
      player.render();
      
      // Auto-stop at end (with small buffer to prevent race conditions)
      if (currentTime >= state.duration - 0.1) {
        this.stopTimeUpdates(componentId);
        
        // Stop current source to prevent overlaps
        if (state.sourceNode) {
          try {
            state.sourceNode.disconnect();
            state.sourceNode.stop();
          } catch (error) {
            // Already stopped
          }
          player.store.setSourceNode(null);
        }
        
        player.store.setPlaying(false);
        player.store.setCurrentTime(0);
        player.store.setPauseTime(0);
        player.render();
      }
    }, 100);
  }

  stopTimeUpdates(componentId) {
    const player = this.players.get(componentId);
    if (player && player.updateInterval) {
      clearInterval(player.updateInterval);
      player.updateInterval = null;
    }
  }
}