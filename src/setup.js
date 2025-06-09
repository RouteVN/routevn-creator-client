import { createWebPatch } from 'rettangoli-fe';
import { h } from 'snabbdom/build/h';

import { CustomSubject } from './common';




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
  router
}

const pageDependencies = {
  subject, 
  router,
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
