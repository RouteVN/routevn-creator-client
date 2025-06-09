
export const INITIAL_STATE = Object.freeze({
  project: 
    {
      id: "1",
      name: "Project",
      description: "Project 1 description",
      imageUrl: "/public/project_logo_placeholder.png"
    },
});

export const toViewData = ({ state, props }, payload) => {
  return state;
};

