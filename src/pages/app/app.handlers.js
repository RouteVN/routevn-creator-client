import { filter, fromEvent, tap } from "rxjs";

export const handleOnMount = (deps) => {
  console.log('handleOnMount', deps.router.getPathName());
  deps.store.setCurrentRoute(deps.router.getPathName());
  deps.render();
    // deps.store.setCurrentRoute('/projects');
}

export const handleRedirect = (payload, deps) => {
  deps.store.setCurrentRoute(payload.path);
  deps.router.redirect(payload.path, payload.payload);
  deps.render();
}

export const handleWindowPop = (payload, deps) => {
  // console.log('handleWindowPop', payload);
  console.log('pathname', deps.router.getPathName())
  deps.store.setCurrentRoute(deps.router.getPathName());
  deps.render();
}

export const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action, payload }) => action === 'redirect'),
      tap(({ action, payload }) => {
        console.log('111111111111111111')
        deps.handlers.handleRedirect(payload, deps);
      })
    ),
    fromEvent(window, "popstate").pipe(
      filter((e) => {
        console.log('popstate', e.target.location)
        // return !!e.target.location;
        return true;
      }),
      tap((e) => {
        deps.handlers.handleWindowPop(e, deps);
      })
    )
    // windowPop$(window, deps.handleWindowPop),
    // filter$(subject, [Actions.router.redirect, Actions.router.replace], deps._redirect),
    // filter$(subject, Actions.router.back, deps._handleBack),
    // filter$(subject, Actions.notification.notify, deps._toastNotify),
    // windowResize$(window, deps._handleWindowResize),
  ]
}



