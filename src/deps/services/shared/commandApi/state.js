export const createStateCommandApi = (shared) => ({
  getState: shared.getStateImpl,

  getDomainState: shared.getDomainStateImpl,

  async getEvents() {
    return shared.getEventsImpl();
  },
});
