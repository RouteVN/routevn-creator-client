# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Build the project:
```bash
bun run build
```

This command:
1. Removes the existing `_site` directory
2. Copies static files from `static/` to `_site/`
3. Runs the Rettangoli CLI to build the frontend bundle to `_site/public/main.js`

## Architecture

This is a Visual Novel Frontend Interface built with the Rettangoli framework. The application follows a component-based architecture where each component/page consists of three files:

- `.view.yaml` - Declarative UI template with data schema validation
- `.store.js` - State management and data transformation
- `.handlers.js` - Event handlers and business logic

### Key Architectural Patterns

1. **Component Structure**: Components are auto-discovered from `src/components/` and `src/pages/` directories. Each component becomes a custom element (e.g., `rvn-command-line-actions`).

2. **View Templates**: YAML files use Rettangoli's templating syntax:
   - Conditional rendering: `$if`, `$elif`, `$else`
   - Loops: `$for item, i in items`
   - Template interpolation: `${expression}`
   - Element attributes use shorthand notation (e.g., `w=f` for width)

3. **State Management**: Stores export:
   - `INITIAL_STATE`: Frozen object with component's initial state
   - `toViewData(({ state, props }, payload))`: Transforms state/props for the view
   - Selector functions that extract specific data from state

4. **Event System**: Uses RxJS Subject (CustomSubject) for component communication. Handlers receive `(event, deps)` where deps includes `dispatchEvent`, `store`, and other injected dependencies.

5. **Routing**: Custom WebRouter implementation handles client-side routing. Pages conditionally render based on `currentRoutePattern`.

### Dependencies Injection

The `setup.js` file configures dependencies injected into all components:
- `subject`: Event bus for inter-component communication
- `router`: Client-side routing
- `patch`: Virtual DOM patching function from Snabbdom
- `h`: Hyperscript function for creating virtual nodes

### Project Structure

- `/src/components/`: Reusable UI components
- `/src/pages/`: Top-level route components
- `/static/`: Static HTML files and assets
- `/_site/`: Build output directory
- `/vt/`: Visual testing configuration

The application is a visual novel creation tool with features for managing projects, resources (backgrounds, CGs), scenes, and includes a scene editor.