
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

export const handleCreateButtonClick = async (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
}

export const handleCloseDialogue = (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
}

export const handleProjectsClick = (e, deps) => {
  const id = e.currentTarget.id
  deps.subject.dispatch('redirect', {
    path: `/project`,
  });
}

