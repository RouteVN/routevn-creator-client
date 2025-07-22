export const handleItemClick = async (payload, deps) => {
  const { render, router, subject } = deps;
  console.log("handleItemClick", payload.detail);
  // deps.render();
  subject.dispatch("redirect", {
    path: payload.detail.item.id,
  });
};

export const handleHeaderClick = (payload, deps) => {
  const { render, router, subject } = deps;
  console.log("handleHeaderClick", payload.detail);
  // deps.render();
  subject.dispatch("redirect", {
    path: "/project",
  });
};
