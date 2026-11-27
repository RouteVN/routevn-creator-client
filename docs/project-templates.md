# Project Templates

A new project starts from a template: the one bundled with the app, one
published in the asset store, or a template file on this device.

## Choosing a template

Create opens the Create Project form with the bundled template chosen. Its
Template row shows the chosen template and a Change button, which opens the
templates over the form; what is typed in the form stays.

The templates list the bundled template first, at once, with a picture of
its title screen (`static/templates/default/cover.webp`), then the store's
templates as cards, newest first, with Load More while pages remain. Choosing
the bundled template returns to the form. A store template opens its page: its
screenshots, one at a time in a 16:9 frame with previous and next and a row of
thumbnails (Left and Right move between them while the frame has focus), its
description, and its summary, creator, resolution, languages, version and
dates. Use Template returns to the form with that template.

Open File, beside the list, picks a [template file](#template-files) instead.
Its manifest is read and checked at once; the form then shows the package's
name, or else the file's, without a cover. A file that is not a template, is
damaged or needs a newer app is refused with an alert, and the templates stay
open.

A store template or template file is made for one resolution, so the form
shows it in the Template row instead of the Resolution field; the bundled
template's resolution is chosen as before.

## Creating a project from a store template

Create downloads the template first, in the Creating Project dialog, with the
bytes downloaded so far:

1. `getProjectTemplateDownloadUrl` signs the template's package ZIP and counts
   one download.
2. The package's central directory and its manifest, `project-template.json`,
   are read by byte range, as an asset pack's are. The manifest must be a
   `routevn.project-template.v1` package of kind
   `routevn.creator.project-template`, written with this app's Creator model
   schema or an older one, and its `repository`, the project's state, must
   pass the Creator model and have a resolution.
3. Each file its `repository.files` lists is read from `files/<id>` and must
   match the record's size and SHA-256.

Only then is the project created, from that state and those files, at the
template's own resolution and with its own fonts; the bundled template's are
chosen for the project's language and scaled to the chosen resolution, as
before. All four platforms create projects through one loader,
`src/deps/clients/web/projectTemplateSource.js`.

If any step fails, nothing is created: the form opens again with what was
typed and the template chosen, and an alert says what happened. A template the
store no longer lists, or one that needs a newer app, has its own message; a
damaged template or a failed download shows its details.

## Template files

Export as template, in the project page's actions menu on every platform,
saves the open project as a template file: one ZIP with its current state and
the files that state uses, without its history. It is the package the asset
store takes for a template, so a publisher can upload it, and Open File
creates a project from it.

| Entry                   | Holds                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project-template.json` | UTF-8 JSON, exactly `{schema, package, creatorModelSchema, repository}`: `package` is `{kind, name, description}`, the last two from the project and left out when empty; `creatorModelSchema` is this app's |
| `files/`                | The folder entry JSZip writes                                                                                                                                                                                |
| `files/<id>`            | One per file record, in the order the project lists them                                                                                                                                                     |

Every entry is stored, uncompressed. The `repository` keeps only the files
something in the state names by ID: a file nothing uses any more, such as one
a replaced sound left behind, and the folders of files are left out, so
`files.tree` is flat. Each record is `{id, type, mimeType, size, sha256}`,
with the size and lowercase SHA-256 of the bytes written.

A project is refused, with an alert saying which limit, before Save asks
where to write; the limits on file sizes are checked again as the files are
read.

| Limit      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Files      | 2,000                                                                 |
| One file   | 50 MiB                                                                |
| All files  | 2 GiB                                                                 |
| Manifest   | 8 MiB                                                                 |
| Resolution | 1 to 16,384 on each side                                              |
| File IDs   | `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, which the Creator's own IDs are |
| File types | PNG, JPEG, WebP, MP3, WAV, Ogg, TTF, OTF, WOFF2, JSON, MP4 and WebM   |

Creating a project from a template file reads it as a store template is
read, a slice at a time from the file instead of by byte range, with the same
checks, and up to the 2 GiB a template can hold rather than the 200 MiB the
app downloads. The Creating Project dialog shows the share read.

## Store calls

The app calls three JSON-RPC methods of the asset store, at the same endpoint,
with the same headers and the same development address as the
[asset store's pack methods](import-packages.md):

| Method                                     | Params                                                   | Used for                                                                                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assetStore.listProjectTemplates`          | `{query, creatorModelSchema, page: {cursor, limit: 20}}` | Template cards. Each item carries `data`, with the title, summary, cover and screenshot file IDs, languages, `resolution` (`{width, height}`), `creatorModelSchema`, pricing and listing date, and its `creator`; `files` maps the file IDs to URLs     |
| `assetStore.getProjectTemplateById`        | `{projectTemplateId, device}`                            | A template's page: the card fields with the rich-text description, `versionName`, `releaseNotes` and `lastUpdatedAt`. Sending `device` counts one view, as opening a pack's page does                                                                   |
| `assetStore.getProjectTemplateDownloadUrl` | `{projectTemplateId, device}`                            | Creating a project: `{versionName, downloadUrl, expiresAt, size, directoryOffset, directorySize}`, the package's signed URL, which allows byte ranges. Sending `device`, when creation starts, counts one download; a fresh URL is asked for without it |

- `creatorModelSchema` is the app's Creator model schema version. The store
  leaves out templates written with a newer one, which this app cannot open.
- As with packs, only free templates are shown. A card without a title,
  resolution or creator is left out, as is a screenshot whose file has no URL.
- A template the store no longer lists shows its own message; a list or page
  that fails to load shows Try Again.

## Mock server

Development builds call `http://127.0.0.1:3100/asset-store/rpc`, where
`bun run mock:asset-store` answers all three methods, so the app needs no
configuration. It checks params
as the API does, pages with cursors bound to the query and schema, answers
`RESOURCE_NOT_FOUND` for a template it does not list, and serves each
screenshot, cover and avatar as an SVG at `/files/<fileId>`.

Each template's package is the bundled template under the template's title,
which its title screen shows, and at its resolution, with the fonts for Latin
scripts only. The mock builds it when it is first asked for and serves it at a
URL that expires after ten minutes, in byte ranges. Kinetic Novel is
1280 × 720; the others are 1920 × 1080.

It lists seven templates, and an eighth that needs Creator model schema 99, so
a current app never shows it.

| Option            | Effect                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <port>`   | Listen on another port; the default is `3100`                                                                                          |
| `--delay <ms>`    | Wait before every answer, `400` by default, to show loading, and an eighth of it before each byte range, to show a download's progress |
| `--fail list`     | Fail every template list, to show its Try Again                                                                                        |
| `--fail detail`   | Fail every template page, to show its Try Again                                                                                        |
| `--fail download` | Fail every download URL, to show a failed creation                                                                                     |
| `--fail package`  | Serve packages with a file that fails its checksum, to show a damaged template                                                         |

It answers only the template methods: the pack methods answer
`Method not found`, so the asset store's packs need a locally running API
instead. The app calls one address for both; to run the mock on another port,
set `VITE_ROUTEVN_ASSET_STORE_RPC_URL` to it when starting the watch server.

`tests/scripts/mockAssetStoreServer.test.js` runs the mock through the app's
asset store client, so the two stay in agreement.
