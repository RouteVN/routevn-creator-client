import { createWebPatch } from 'rettangoli-fe';
import { h } from 'snabbdom/build/h';

import { CustomSubject } from './common';
import { createRepository } from './repository';

import { createAutoMergeData } from './automerge/sample.js'
import stepsEditorAutomergeData from './automerge/sample3.js'

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
    items: {
      image1: {
        name: 'Image 1',
        url: 'https://via.placeholder.com/150',
      },
      image2: {
        name: 'Image 2',
        url: 'https://via.placeholder.com/150',
      },
    },
    tree: [{
      id: 'image1',
      children: [{
        id: 'image2',
        children: [],
      }]
    }]
  }
}

const repository = createRepository(initialData);

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
  subject,
  router,
  repository,
  localData: {
    backgrounds: backgroundsData,
    'scene:1': stepsEditorAutomergeData(),
  },
}

const pageDependencies = {
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
