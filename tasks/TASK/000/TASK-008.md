---
title: Make web version work
status: todo
priority: medium
---

# Description

Currently, the app works only for Tauri environment. We want it to work for Web as well. Main advantage of having a web version working is that we can run playwright to do automated testing

Most of the work will be to implement `setup.web.js` by referencing `setup.tauri.js`

- On the web version it should use indexeddb instead of sqlite.
- Open project should be disabled on web version
- Files will also be stored in an indexeddb as binary blob data
- Might need to do some research for else is required to make web version work.

