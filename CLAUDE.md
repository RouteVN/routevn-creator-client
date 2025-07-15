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

This project uses a custom frontend framework based on 3 component files: view, store, handlers:

Read the links from the following files to familiarize with the code before starting to write any code.

- [Overview](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/overview.md)
- [View](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/view.md)
- [State Management](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/store.md)
- [Handlers](https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/handlers.md)
