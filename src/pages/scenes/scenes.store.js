
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
  }],
  whiteboardItems: [{
    id: 'scene-1',
    name: 'Scene 1',
    x: 100,
    y: 50,
  }, {
    id: 'scene-2', 
    name: 'Scene 2',
    x: 300,
    y: 150,
  }, {
    id: 'scene-3',
    name: 'Scene 3', 
    x: 500,
    y: 100,
  }]
});

export const updateItemPosition = (state, { itemId, x, y }) => {
  const item = state.whiteboardItems.find(item => item.id === itemId);
  if (item) {
    item.x = x;
    item.y = y;
  }
};

export const toViewData = ({ state, props }, payload) => {
  return state;
};

