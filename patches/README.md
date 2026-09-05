# Rettangoli UI dialog spacing

`@rettangoli/ui@1.21.1` has a pinned Bun patch for its shared alert/confirm layout:

- Remove the content wrapper's `p=lg`; `rtgl-dialog` already provides that padding.
- Remove the action row's `mt=lg`; the parent already provides the vertical gap.

The patch includes the source view and its rebuilt `dist/rettangoli-iife-ui.min.js`.
The generated bundle diff includes minifier identifier changes. Form dialogs,
component dialogs, and the dialog primitive's defaults are unchanged.

`bun install --frozen-lockfile` applies the patch. Build and mobile watch scripts
recopy patched packages so a previously cached static bundle cannot hide the fix.
Run `bun run test:update-dialogs` with Google Chrome installed to check the actual
Android updater UI at 320px, 360px, and 1280px; screenshots go to
`.artifacts/update-dialogs/`. The bridge is simulated in an isolated browser page,
and application code has no test-mode switches. Actual Google Play delivery must
still be tested through Internal App Sharing.

To rebuild the patch, run `bun patch @rettangoli/ui@1.21.1`, update the view, then
build the package's `src/entry-iife-ui.js` from its FE-generated entry using the
Rettangoli UI build procedure. Copy the rebuilt IIFE bundle back into the patched
package and run `bun patch --commit node_modules/@rettangoli/ui`.

Remove this patch when upgrading to a Rettangoli UI release containing the same
spacing correction.
