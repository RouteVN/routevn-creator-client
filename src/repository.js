const set = (state, path, value) => {
  const newState = structuredClone(state);
  const keys = path.split('.');
  let current = newState;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...current[key] };
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
  return newState;
};

const get = (state, path) => {
  return path.split(".").reduce((acc, key) => {
    return acc[key];
  }, state);
};

export const createRepository = (initialState, initialActionSteams) => {
  const actionStream = initialActionSteams || [];

  const addAction = (action) => {
    actionStream.push(action);
  };

  const getState = () => {
    return actionStream.reduce((acc, action) => {
      const { actionType, target, value } = action;
      if (actionType === "set") {
        return set(acc, target, value);
      }
      if (actionType === "arrayPush") {
        const targetItem = get(acc, target);
        // targetItem.push(value);
        targetItem.tree.push({
          id: value.id,
          children: []
        })
        targetItem.items[value.id] = value;
      }
      return acc;
    }, structuredClone(initialState));
  };

   return {
    addAction,
    getState,
  };
};


// input:
// {
//   items: {
//     image1: {
//       name: 'Image 1',
//       url: 'https://via.placeholder.com/150',
//     },
//     image2: {
//       name: 'Image 2',
//       url: 'https://via.placeholder.com/150',
//     },
//   },
//   tree: [{
//     id: 'image1',
//     children: [{
//       id: 'image2',
//       children: [],
//     }]
//   }]
// }
// 
// output:
// [
//   {
//     id: 'image1',
//     name: 'Image 1',
//     url: 'https://via.placeholder.com/150',
//     _level: 0
//   },
//   {
//     id: 'image2',
//     name: 'Image 2',
//     url: 'https://via.placeholder.com/150',
//     _level: 1
//   },
// ]
// 
export const toFlatItems = (data) => {
  const { items, tree } = data;
  const flatItems = [];
  const visited = new Set();

  const traverse = (node, level = 0) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    
    const item = {
      ...items[node.id],
      id: node.id,
      _level: level
    };
    flatItems.push(item);

    if (node.children) {
      node.children.forEach(child => traverse(child, level + 1));
    }
  };

  tree.forEach(node => traverse(node));
  return flatItems;
};
