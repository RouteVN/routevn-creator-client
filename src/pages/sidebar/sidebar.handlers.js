// const handleOnMount = (deps) => {
//   deps.store.increment()
//   deps.httpClient.get('...').then(response => {})
//   deps.setSubscriptions([])
// }

// const createSubscriptions = (deps) => {
//   const { subject } = deps;
//   return [
//     windowPop$(window, deps.handleWindowPop),
//     filter$(subject, [Actions.router.redirect, Actions.router.replace], deps._redirect),
//     filter$(subject, Actions.router.back, deps._handleBack),
//     filter$(subject, Actions.notification.notify, deps._toastNotify),
//     windowResize$(window, deps._handleWindowResize),
//   ]
// }

export const handleSidebarClick = async (payload, deps) => {
  deps.store.increment();
  deps.render();
}

export const handleDescriptionClick = (payload, deps) => {
  deps.store.addHobby();
  deps.render();
}

