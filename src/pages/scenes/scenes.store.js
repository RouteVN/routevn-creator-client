
export const INITIAL_STATE = Object.freeze({
  items: [{
    id: 'scene-1',
    name: 'Scene 1',
  }, {
    id: 'scene-2',
    name: 'Scene 2',
  }, {
    id: 'scene-3',
    name: 'Scene 3',
  }]
});

export const toViewData = ({ state, props }, payload) => {
  return state;
};

