### How to implement

- Update the engine with a new function on the selectPresentationChanges() so it can return the changes between previous and current state
  - One with Current Line, and one with previous line, and then return the changes

- On the graphicService call that function from the engine, that will return the changes of the state.
- Then instead of lines, pass that to the changes to the linesEditor, and process it to render the data (It's a bit complicated)

