import { createWebPatch } from 'rettangoli-fe';
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
  baseUrl: 'http://192.168.0.3:8788',
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
    return {};
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

const subject = new CustomSubject();

const router = new WebRouter();

const componentDependencies = {
  httpClient,
  subject,
  router,
  repository,
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
