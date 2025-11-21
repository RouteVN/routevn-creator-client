---
title: Improve automated update. should check every interval instead of only when app is opened
status: done
priority: high
---

# Description

We have 2 ways to trigger update:

- Automated internal update
  - check when user opens the app
  - check every interval like 6 hours
  - if fetch network fails, there should be silent, no dialog notification (is too disruptive)
  - if there is new version avaialble, should open dialogue for user to accept

- Active update. when user click button
  - if fetch network fails in this case, should show a dialog showing failed the fetch update info

