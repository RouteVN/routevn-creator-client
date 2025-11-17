---
title: Migrate to new version of route-graphics for LayoutEditor
status: todo
assignee: nghia
priority: high
---

# Description

- `src/pages/layoutEditor` is using old version of route-graphic
- publish new version or route-graphics
- update the route-graphics version in routevn-creator-client
- route graphics is currently imported as dependency in `src/deps/2drenderer.js`
  - there are some other places using it. can do in a separate task
- migrate to use the latest version of route-graphics, with all new API
- sorry, the code is messy. can propose imporvements for a separate task

