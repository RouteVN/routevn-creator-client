const createInitialState = () => ({
  players: new Map()
});

const addPlayer = (state, componentId, playerInfo) => {
  const newPlayers = new Map(state.players);
  newPlayers.set(componentId, { ...playerInfo, updateInterval: null });
  return { ...state, players: newPlayers };
};

const removePlayer = (state, componentId) => {
  const newPlayers = new Map(state.players);
  newPlayers.delete(componentId);
  return { ...state, players: newPlayers };
};

const updatePlayerInterval = (state, componentId, intervalId) => {
  const newPlayers = new Map(state.players);
  const player = newPlayers.get(componentId);
  if (player) {
    newPlayers.set(componentId, { ...player, updateInterval: intervalId });
  }
  return { ...state, players: newPlayers };
};

// Pure calculation functions
const calculateTimeUpdate = (audioState) => {
  if (!audioState.isPlaying || audioState.isSeeking) {
    return null;
  }
  
  if (!audioState.audioContext || !audioState.sourceNode) {
    return { shouldStop: true };
  }
  
  const elapsed = audioState.audioContext.currentTime - audioState.startTime;
  const currentTime = Math.min(elapsed, audioState.duration);
  const isNearEnd = currentTime >= audioState.duration - 0.1;
  
  return { currentTime, isNearEnd };
};

// Main AudioManager class with functional approach
export default class AudioManager {
  constructor() {
    this.state = createInitialState();
  }

  registerPlayer(componentId, store, render) {
    this.state = addPlayer(this.state, componentId, { store, render });
  }

  unregisterPlayer(componentId) {
    const player = this.state.players.get(componentId);
    if (player && player.updateInterval) {
      clearInterval(player.updateInterval);
    }
    this.state = removePlayer(this.state, componentId);
  }

  startTimeUpdates(componentId, onUpdate = null) {
    const player = this.state.players.get(componentId);
    if (!player) return;

    if (player.updateInterval) {
      clearInterval(player.updateInterval);
    }

    const intervalId = setInterval(() => {
      const updates = this.calculateUpdates(componentId);
      if (updates) {
        this.applyUpdates(componentId, updates, onUpdate);
      }
    }, 100);

    this.state = updatePlayerInterval(this.state, componentId, intervalId);
  }

  // Pure function: calculate what updates are needed
  calculateUpdates(componentId) {
    const currentPlayer = this.state.players.get(componentId);
    if (!currentPlayer) {
      return { type: 'CLEANUP', componentId };
    }

    const state = currentPlayer.store.getState();
    const timeUpdate = calculateTimeUpdate(state);
    
    if (!timeUpdate) return null;
    
    if (timeUpdate.shouldStop) {
      return { type: 'STOP', componentId };
    }
    
    if (timeUpdate.isNearEnd) {
      return { 
        type: 'END_PLAYBACK', 
        componentId, 
        currentTime: timeUpdate.currentTime 
      };
    }
    
    return { 
      type: 'UPDATE_TIME', 
      componentId, 
      currentTime: timeUpdate.currentTime 
    };
  }

  // Apply updates (contains side effects)
  applyUpdates(componentId, updates, onUpdate) {
    const player = this.state.players.get(componentId);
    if (!player) return;

    switch (updates.type) {
      case 'CLEANUP':
        clearInterval(updates.componentId);
        break;
        
      case 'STOP':
        this.stopTimeUpdates(componentId);
        break;
        
      case 'UPDATE_TIME':
        // Side effect: update store
        player.store.setCurrentTime(updates.currentTime);
        // Side effect: render
        if (onUpdate) {
          onUpdate(updates);
        } else {
          player.render();
        }
        break;
        
      case 'END_PLAYBACK':
        player.store.setCurrentTime(updates.currentTime);
        this.handlePlaybackEnd(componentId, player, onUpdate);
        break;
    }
  }

  handlePlaybackEnd(componentId, player, onPlaybackEnd = null) {
    this.stopTimeUpdates(componentId);
    
    const endActions = this.calculatePlaybackEndActions(player.store.getState());
    this.applyPlaybackEndActions(player, endActions, onPlaybackEnd);
  }

  // Pure function: calculate what actions are needed for playback end
  calculatePlaybackEndActions(state) {
    return {
      shouldStopSource: Boolean(state.sourceNode),
      sourceNode: state.sourceNode,
      resetState: {
        isPlaying: false,
        currentTime: 0,
        pauseTime: 0,
        sourceNode: null
      }
    };
  }

  // Apply playback end actions (contains side effects)
  applyPlaybackEndActions(player, actions, onPlaybackEnd) {
    // Stop current source (side effect)
    if (actions.shouldStopSource) {
      try {
        actions.sourceNode.disconnect();
        actions.sourceNode.stop();
      } catch (error) {
        // Already stopped
      }
    }
    
    // Reset playback state (side effects)
    player.store.setSourceNode(null);
    player.store.setPlaying(false);
    player.store.setCurrentTime(0);
    player.store.setPauseTime(0);
    
    // Render (side effect)
    if (onPlaybackEnd) {
      onPlaybackEnd({ type: 'PLAYBACK_ENDED', state: player.store.getState() });
    } else {
      player.render();
    }
  }

  stopTimeUpdates(componentId) {
    const player = this.state.players.get(componentId);
    if (player && player.updateInterval) {
      clearInterval(player.updateInterval);
      this.state = updatePlayerInterval(this.state, componentId, null);
    }
  }
}