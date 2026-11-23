# Project Templates

A new project starts from a template: the one bundled with the app, or one
published in the asset store.

## Choosing a template

Create opens the Create Project form with the bundled template chosen. Its
Template row shows the chosen template and a Change button, which opens the
templates over the form; what is typed in the form stays.

The templates list the bundled template first, at once, then the store's
templates as cards, newest first, with Load More while pages remain. Choosing
the bundled template returns to the form. A store template opens its page: its
screenshots, one at a time in a 16:9 frame with previous and next and a row of
thumbnails (Left and Right move between them while the frame has focus), its
description, and its summary, creator, resolution, languages, version and
dates. Use Template returns to the form with that template.

Store templates are not downloaded yet: a project made from one starts from
the bundled template.

## Store calls

The app calls two JSON-RPC methods of the asset store, at the same endpoint,
with the same headers and the same development address as the
[asset store's pack methods](import-packages.md):

| Method                              | Params                                                   | Used for                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assetStore.listProjectTemplates`   | `{query, creatorModelSchema, page: {cursor, limit: 20}}` | Template cards. Each item carries `data`, with the title, summary, cover and screenshot file IDs, languages, `resolution` (`{width, height}`), `creatorModelSchema`, pricing and listing date, and its `creator`; `files` maps the file IDs to URLs |
| `assetStore.getProjectTemplateById` | `{projectTemplateId, device}`                            | A template's page: the card fields with the rich-text description, `versionName`, `releaseNotes` and `lastUpdatedAt`. Sending `device` counts one view, as opening a pack's page does                                                               |

- `creatorModelSchema` is the app's Creator model schema version. The store
  leaves out templates written with a newer one, which this app cannot open.
- As with packs, only free templates are shown. A card without a title,
  resolution or creator is left out, as is a screenshot whose file has no URL.
- A template the store no longer lists shows its own message; a list or page
  that fails to load shows Try Again.

## Mock server

Until the store serves templates, `bun run mock:asset-store` answers both
methods at `http://127.0.0.1:3100/asset-store/rpc`, the address development
builds call, so the app needs no configuration. It checks params as the API
does, pages with cursors bound to the query and schema, answers
`RESOURCE_NOT_FOUND` for a template it does not list, and serves each
screenshot, cover and avatar as an SVG at `/files/<fileId>`.

It lists seven templates, and an eighth that needs Creator model schema 99, so
a current app never shows it.

| Option          | Effect                                                      |
| --------------- | ----------------------------------------------------------- |
| `--port <port>` | Listen on another port; the default is `3100`               |
| `--delay <ms>`  | Wait before every answer, `400` by default, to show loading |
| `--fail list`   | Fail every template list, to show its Try Again             |
| `--fail detail` | Fail every template page, to show its Try Again             |

It answers only the template methods: the pack methods answer
`Method not found`, so the asset store's packs need a locally running API
instead. The app calls one address for both; to run the mock on another port,
set `VITE_ROUTEVN_ASSET_STORE_RPC_URL` to it when starting the watch server.

`tests/scripts/mockAssetStoreServer.test.js` runs the mock through the app's
asset store client, so the two stay in agreement.
