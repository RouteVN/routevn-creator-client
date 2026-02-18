---
title: UX Improvements for larger projects and files
status: todo
priority: medium
---

# Description

## When playing export

- currently after exporting the VN and running it. we need user to click in order to make sounds and video available.
- currently it works like this:
  - black screen with 'loading...' text
  - after load finished it shows 'click to start'
  - after click it shows 'starting...'
  - after starting is finished, it actually starts
- What we want is to remove the 'starting...' one. It should start immediately once click start
- might need to update engine code, so we have a more clear split between loading asseets and starting itself.

## Optimize Scene editor assets loading

- in scene editor, currently it loads assets of the ALL scenes
- we want instead to only load assets used in current scene. this is so we can save more resources usages, especially for large projects.
- when adding an asset, or when preview going outside the scene. we need to show a 'loding assets...' screen so it is loading the assets.
- need to think how to best implmeent this, graphics code, might need a bit change, to check for which assets have been loaded or which one not loaded.

## A way to see overview of all sections in a scene

- some users had like 30 sections in a scene. however on the top bar we can only see like 5 sections at a time. so user has to scroll horizontally, very inconvenient.
- on the right of the sections tabs. we have a plus button. Add another button with a hamburger icon or something. when this is clicked. it will show all the sections.
- simple method, can show just all sections in a list.
- advanced method, can show sections with the connections for which section is connected to which section. but this is more advanced we need to think about design.

## Analyze and give warning for dead ends

- Sometimes, some sections have dead ends, meaning the lines finish and don't do anything. no transition, no choices with transition. sometimes this is unintentional. it would be nice, to show a warning or something so user can easily find all the sections with dead ends.

## Scene Map, right panel, show more details about sectinos.

- Right now, the right panel of a scene is pretty plain. there is no much info.
- It would be nice to show some info about sections. for example the number of sectinos. and maybe you can click to expand and show all the sections.

## Versions Export, no confirmations.

- right now when export is started, we show a loading dialogue... but when export is ended the dialogue just closes
- would be nice to show a dialogue like "export copmleted" when the export has actually completed, and maybe with the location of where it was downloaded.






