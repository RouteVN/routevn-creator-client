
# RouteVN Creator Client

RouteVN Creator Client is a frontend application for building Visual Novels with a drag & drop visual UI, without needing to write any code.

This is a complete **Single Page Application (SPA)** that operates **offline-first** using localStorage persistence through the Repository system.

## Frameworks used

- [@rettangoli/fe](https://github.com/yuusoft-org/rettangoli/tree/main/packages/rettangoli-fe) - Is used as the frontend framework
- [@rettangoli/ui](https://github.com/yuusoft-org/rettangoli/tree/main/packages/rettangoli-ui) - Is used as the UI library
- [Repository](docs/Repository.md) - Is used as the state management system (enables offline-first functionality)

## External Dependencies

- [RouteVN API](https://github.com/yuusoft-org/routevn-api) - You need to run this backend project in order to use the APIs

## Project Structure

Entrypoint defined in `static/index.html` with the `<rvn-app>` tag.

`src/pages/app/` - **Application entrypoint**

Folder structure

- `src/components/` - Reusable UI components
<!-- TODO better differenciate component and pages -->
- `src/pages/` - Global components with their own state
- `src/deps/` - Custom utilities that will be accessible via deps
- `static/` - Static HTML files and assets
- `_site/` - Build output directory

## Adding Routes

To add a new route, you need to update 3 files:

1. **Create HTML file in `static/`** - Add the static HTML file for the route
2. **Update `src/pages/app/app.view.yaml`** - Add the route condition and component
3. **Update `src/pages/app/app.store.js`** - Add the route pattern to the arrays

Example for adding `/project/new-feature`:

```yaml
# In app.view.yaml
$elif currentRoutePattern == "/project/new-feature":
  - rvn-new-feature: []
```

```javascript
// In app.store.js - add to both routePatterms and routesWithNavBar arrays
"/project/new-feature",
```

## Development

Install dependencies:
```shell
bun install
```

Build the project:
```shell
bun run build
```

<!-- TODO implmement watch mode -->

Run the project:
```shell
bunx serve _site
```

Open: http://localhost:3000/project
