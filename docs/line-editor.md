### How to implement

- Update the engine with a new function on the selectPresentationChanges() so it can return the changes between previous and current state
  - One with Current Line, and one with previous line, and then return the changes

- On the graphicService call that function from the engine, that will return the changes of the state.
- Then instead of lines, pass that to the changes to the linesEditor, and process it to render the data (It's a bit complicated)

Let's assume this is the scene

Line 1 - character added background added
line 2 - no change
line 3- character removed background removed

for such case, we just treat it as an update, and show only the end characters which is Character B only.