export const createInitialState = () => ({});

// A genuinely non-serializable payload: nested objects, an array, a Date,
// and a function. None of this has an HTML representation.
export const selectViewData = () => ({
  user: { name: "Ada Lovelace", role: "admin", since: new Date("1843-01-01") },
  tags: [
    { id: "t1", label: "Engine" },
    { id: "t2", label: "Story" },
    { id: "t3", label: "Audio" },
  ],
  onPick: (id) => `picked:${id}`,
});
