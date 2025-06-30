import { createWebPatch } from '@rettangoli/fe';
import { h } from 'snabbdom/build/h';

import { CustomSubject, createHttpClient } from './common';
import { createRepository } from './repository';

import { createAutoMergeData } from './automerge/sample.js'
import stepsEditorAutomergeData from './automerge/sample3.js'


/**
 * @typedef {Object} HttpClient
 * @property {Object} creator - Creatorendpoints
 * @property {function(string): Promise<string>} creator.uploadFile - Upload file
 * @property {function(string): Promise<string>} creator.getFileContent - Get file content
 * @property {function(string): void} setAuthToken - Set auth token
 */

const createRouteVnHttpClient = ({ baseUrl, headers }) => {
  /**
   * @type {HttpClient}
   */
  const httpClient = createHttpClient({
    baseUrl,
    headers,
    apis: {
      creator: {
        uploadFile: {},
        getFileContent: {},
      },
    },
  });

  return httpClient;
};

 const httpClient = createRouteVnHttpClient({
  baseUrl: 'http://localhost:8788',
  headers: {
    "X-Platform": "web",
  },
});


const backgroundsData = createAutoMergeData()
backgroundsData.createItem('_root', {
  name: 'Initial Item',
  level: 0
})

const initialData = {
  project: {
    name: 'Project 1',
    description: 'Project 1 description'
  },
  images: {
    items: {},
    tree: []
  },
  animations: {
    items: {},
    tree: []
  },
  audio: {
    items: {},
    tree: []
  },
  videos: {
    items: {},
    tree: []
  },
  characters: {
    items: {},
    tree: []
  },
  fonts: {
    items: {},
    tree: []
  },
  placements: {
    items: {},
    tree: []
  },
  colors: {
    items: {},
    tree: []
  },
  typography: {
    items: {},
    tree: []
  },
  variables: {
    items: {},
    tree: []
  },
  components: {
    items: {},
    tree: []
  },
  layouts: {
    items: {},
    tree: []
  },
  preset: {
    items: {},
    tree: []
  },
  scenes: {
    items: {},
    tree: []
  }
}

const localStorageRepositoryEventStream = localStorage.getItem('repositoryEventStream') 
const localEventStream = localStorageRepositoryEventStream ? JSON.parse(localStorageRepositoryEventStream) : [];
const repository = createRepository(initialData, localEventStream);
setInterval(() => {
  localStorage.setItem('repositoryEventStream', JSON.stringify(repository.getActionStream()));
}, 5000);


class WebRouter {
  // _routes;
  routerType = "web";

  getPathName = () => {
    return window.location.pathname;
  };

  getPayload = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const payload = {};
    for (const [key, value] of searchParams.entries()) {
      payload[key] = value;
    }
    return payload;
  };

  setPayload = (payload) => {
    // update query params without reloading the page
    const newQueryParams = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      newQueryParams.set(key, value);
    });
    if (newQueryParams.toString()) {
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${newQueryParams.toString()}`
      );
    } else {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  redirect = (path, payload) => {
    let finalPath = path;
    if (payload) {
      let qs = "";
      if (payload) {
        qs = `?${new URLSearchParams(payload).toString()}`;
      }
      finalPath = `${path}${qs}`;
    }
    window.history.pushState({}, "", finalPath);
  };

  replace = (path, payload) => {
    let finalPath = path;
    if (payload) {
      let qs = "";
      if (payload) {
        qs = `?${new URLSearchParams(payload).toString()}`;
      }
      finalPath = `${path}${qs}`;
    }
    window.history.replaceState({}, "", finalPath);
  };

  back = () => {
    window.history.back();
  };

  get stack() {
    return [];
  }
}

class AudioManager {
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

const subject = new CustomSubject();

const router = new WebRouter();

const audioManager = new AudioManager();

const componentDependencies = {
  httpClient,
  subject,
  router,
  repository,
  audioManager,
  localData: {
    backgrounds: backgroundsData,
    'scene:1': stepsEditorAutomergeData(),
  },
}

const pageDependencies = {
  httpClient,
  subject, 
  router,
  repository,
  audioManager,
  localData: {
    backgrounds: backgroundsData,
    'scene:1': stepsEditorAutomergeData(),
  },
}

const deps = {
  components: componentDependencies,
  pages: pageDependencies,
}

const patch = createWebPatch();

export {
  h,
  patch,
  deps,
}
