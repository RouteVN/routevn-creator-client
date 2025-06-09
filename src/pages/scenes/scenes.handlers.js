
export const handleTitleClick = (e, deps) => {

  const { subject } = deps;

  subject.dispatch('redirect', {
    path: '/projects/1/scenes/1/editor',
  })
}
