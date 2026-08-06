export const createInitialState = () => ({});

// Renders FROM the object props. If the server did not really receive them,
// this output would be empty.
export const selectViewData = ({ props }) => ({
  name: props.user?.name ?? "(no user)",
  role: props.user?.role ?? "(no role)",
  year: props.user?.since instanceof Date ? props.user.since.getFullYear() : "(not a Date)",
  tags: props.tags ?? [],
  callable: typeof props.onPick === "function" ? props.onPick("t2") : "(not a function)",
  label: props.label ?? "(none)",
});
