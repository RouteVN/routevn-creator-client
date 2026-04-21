# VT Coverage Checklist

Generated suite additions: 40 specs with 130 explicit screenshots.

The broader repo VT total also includes the existing checked-in specs under `vt/specs/projects/` and `vt/specs/project/`.

## Existing Baseline Specs Retained

- Projects page responsive states on wide, laptop, tablet, and mobile viewports.
- Project creation flow from the real UI into the project shell.
- Seeded workspace navigation through project, about, releases, scenes, scene editor, and core resource routes.
- Seeded resource detail coverage for colors, fonts, and text styles.
- Image-specific interaction coverage for detail panels, preview overlay, edit dialog, and explorer drag/drop.
- Scene map creation flow and seeded scene workspace preview coverage.

## Project Shell And Navigation

- Project overview detail panel and project edit dialog.
- Project edit submit flow with updated overview state.
- About route.
- Versions empty state.
- Version creation flow, selected detail state, and edit dialog.
- Version edit submit flow from the selected detail panel.
- Keyboard route shortcuts for images, colors, variables, and spritesheets.
- Keyboard route shortcuts for shell routes, UI resources, and asset resources.

## UI Resource Pages

- Colors page list state, selected detail state, preview dialog, and edit dialog.
- Colors search empty state.
- Fonts page list state, selected detail state, glyph preview dialog, and edit dialog.
- Fonts search empty state.
- Text styles page list state, selected detail state, and edit dialog with live preview.
- Text styles search empty state.
- Layouts page list state, selected detail state, edit dialog, and layout editor route entry.
- Layouts search empty state.
- Controls page selected detail state, embedded keyboard action summary, and command editor.
- Variables page empty state, add dialog, created row/detail state, and edit dialog.
- Variables search filtering for created rows.
- Variables create flows for number and boolean types.

## Asset Resource Pages

- Images search empty state.
- Characters page empty state, create dialog, selected detail state, edit dialog, and character sprites route entry.
- Characters search filtering for newly created items.
- Character sprites page empty state, upload flow, selected detail state, full-image preview, and edit dialog.
- Character sprites search empty state after upload.
- Transforms page selected detail state, preview dialog, and edit dialog.
- Transforms search empty state.
- Animations page selected detail state, edit dialog, and animation editor route entry.
- Animations search empty state.
- Sounds page empty state, upload flow, selected detail state, audio player preview, and edit dialog.
- Sounds edit submit and search filtering after upload.
- Videos page empty state, upload flow, selected detail state, preview dialog, and edit dialog.
- Videos edit submit and search filtering after upload.
- Spritesheets page empty state, create/import dialog, populated detail state, and preview dialog.
- Spritesheets filtered and empty search states after creation.
- Particles page empty state, preset picker, particle editor, and populated detail state.
- Particles edit dialog from the populated detail state and search empty state.
