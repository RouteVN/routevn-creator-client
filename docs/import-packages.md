# Asset Package Import

## Purpose

RouteVN Creator imports reusable resources from a strict Asset Package manifest.
The old animation-only and transform-only package formats are not supported.

An Asset Package may contain images, sounds, videos, characters, transforms,
animations, audio effects, particles, spritesheets, colors, fonts, text styles,
layouts, variables, and controls. The creator currently excludes layouts from
its export picker.

## Manifest

The manifest is a partial RouteVN repository:

```json
{
  "schema": "routevn.import-pack.v1",
  "package": {
    "kind": "routevn.creator.asset-package"
  },
  "repository": {
    "files": {
      "items": {
        "file.spark": {
          "id": "file.spark",
          "mimeType": "image/png",
          "source": {
            "url": "./files/file.spark"
          }
        }
      }
    },
    "images": {
      "items": {
        "folder.effects": {
          "id": "folder.effects",
          "type": "folder",
          "name": "Effects"
        },
        "image.spark": {
          "id": "image.spark",
          "type": "image",
          "name": "Spark",
          "fileId": "file.spark"
        }
      },
      "tree": [
        {
          "id": "folder.effects",
          "children": [{ "id": "image.spark" }]
        }
      ]
    }
  }
}
```

Only included repository collections are imported. Each collection uses the
normal `{ items, tree }` shape, and folders are regular items with
`type: "folder"`.

The creator exports only `package.kind`. Catalog metadata such as package id,
name, version, description, publisher, or source may be supplied by a publishing
system, but is not required in a creator-generated manifest.

## IDs and references

Every file, folder, and resource id in the manifest is package-local. The
importer generates project ids and rewrites only schema-defined file and
resource reference fields.

Required resource dependencies must be present. During review, selected
dependencies remain selected and cannot be deselected while a selected resource
requires them. Missing required dependencies reject the package.

Scene, section, and line ids are project-owned. Resources containing
`sceneId`, `sectionId`, `lineId`, or their plural forms are rejected until
story content can be packaged and remapped.

## Files

File-backed resources reference records in `repository.files.items`.
`source.url` may be absolute or relative to the final manifest URL. Optional
`size` and `sha256` values are validated when supplied.

The creator downloads a ZIP with this layout:

```text
asset-package.json
files/<package-local-file-id>
```

After extraction, the directory can be served directly by a static file server.

Files are fetched with request timeouts, per-file and total byte limits,
content-type checks, and optional SHA-256 verification. They are validated
against the owning resource type before staging.

## Folder trees and dependencies

The creator lets users choose top-level folders. Selecting a folder includes its
complete subtree and preserves folder and item order. Export also includes
transitive resource and file dependencies, even when their source folders were
not explicitly selected.

Import recreates the selected resources' complete package folder ancestry in
the matching project collections, after the project's own folders and
resources, in package order. It does not ask for replacement destination
folders or media substitutions.

Files, folders, and resources are committed in one atomic command batch. A
pre-commit failure discards staged files. If commit confirmation is interrupted,
staged files are retained so a retry can recognize an already committed plan.

## Preview media

Resources may reference package-only preview files through
`previewMediaFileId` and `thumbnailMediaFileId`. Supported preview MIME types
are JPEG, PNG, WebP, MP4, and WebM.

Preview files are fetched lazily through the same bounded client as imported
files. Preview-only fields and files are not persisted in the destination
project unless another retained resource field references the file.

Creator-generated previews include:

- animations: one full cycle on a black background, plus a preview-derived
  thumbnail video scaled to fit within 640 by 360
- particles: full-resolution and lower-resolution videos
- spritesheets: one full cycle of the first animation at its configured FPS,
  in full-resolution and lower-resolution videos
- sounds: a 640 by 360 waveform PNG
- fonts: a 1920 by 1080 glyph preview and a 640 by 360 thumbnail
- text styles: a 960 by 270 preview and a 427 by 120 thumbnail

Generated video MIME type is MP4 or WebM depending on the desktop WebView's
canvas recording support. Generated previews exist only in the exported ZIP.

Video previews play muted and loop, holding the last frame for half a second
before playing again. In the pack page's asset grid and the
resource choice list, each video shows the frame a third of the way through
and plays from the start only while a mouse is over its card or the card has
keyboard focus; touch devices show the still frame. The full-screen preview
plays at once. A video stops while it is off screen or covered by the
full-screen preview. WebKit, which the macOS and iOS apps use, can stop a
WebM video at its end while still reporting it as playing, without an ended
event, so the player treats a video held on its last frame as ended.

## Asset store

Import opens the RouteVN asset store full screen: a sidebar with Search and Tags
fields, and free packs, newest first, 20 at a time, each with its cover, author
and asset count. Search matches pack titles and author names once typing pauses
for 300 ms. A pack's tags name the kinds of resources it holds, such as Images
or Sounds, and use the resource types' names. The Tags field shows the chosen
tags; clicking it lists every tag, and saving the choice lists the packs with
any of them. Import on a resource page opens the store with that resource type's
tag chosen, such as Images on the Images page; character sprites and layouts
open with no tag. Choosing a pack opens its page: a gallery of the pack's
screenshots, which steps forward and back and opens full screen, its
description, and every asset in the pack, read from its manifest. Assets are
grouped as on the resource pages: a group for each type's own assets and one for
each folder, labelled with its path such as Images > Masks, collapsible, with
each asset on a card that shows its name. Beside them, a pack info panel holds the cover, author,
version, release and update dates, asset count and Import, and stays in view
while the page scrolls; narrower windows show the panel above the gallery. The
page opens at once with what the pack's list card carries: title, cover,
gallery, description, author, release date and asset count. The version and last
update follow with the pack's details, and the assets last, once its manifest is
read; Import waits for them. Back while the page loads cancels its requests.
Clicking an asset previews it full screen, with its whole description, using its
full-size preview file when the pack has one. The pack's author opens the author page: avatar, name, bio,
profile links, which open in the system browser, and the author's packs. Import
on a pack page continues with the import flow below. Back, the square button
beside each page's title, steps from the resource choice to the pack page,
keeping the choices made there, from a pack page to the list or author page it
was opened from, and from the author page to the pack page it was opened from,
or to the list. The app has no purchases, so it requests and shows free packs
only.

The client calls three JSON-RPC methods at `https://api1.routevn.com/reader/rpc`,
with the `X-RouteVN-RPC: 1` header and no credentials:

| Method                    | Params                                                                | Used for                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reader.listAssetPacks`   | `{query, authorId, pricingType: "FREE", tags, page: {cursor, limit}}` | Pack cards. Each item carries `data`, with the description and `screenshotFileIds`, and `author`; `files` maps cover, avatar and screenshot IDs to URLs. `tags` is `null` or a list of tags. |
| `reader.getAssetPackById` | `{assetPackId}`                                                       | The pack page's details, its screenshots (`data.screenshotFileIds`), and the import link: the `files` URL of `data.manifestFileId`.                                                          |
| `reader.getCreatorById`   | `{creatorId}`                                                         | The author page's profile; an author is a publisher profile. `reader.listAssetPacks` with `authorId` lists the author's packs.                                                               |

Development builds call `http://127.0.0.1:3100/reader/rpc` instead. Set
`VITE_ROUTEVN_ASSET_STORE_RPC_URL` when starting the watch server to use another
local API. A list that fails to load shows Try Again, and a pack that is no
longer listed shows its own message.

## Import flow

1. Choose a pack in the asset store, then load and strictly validate its
   manifest.
2. Show a selection page when the package contains multiple resources.
3. Keep required dependencies selected and locked.
4. Let the user review and edit each selected resource's name and description.
5. Lazily load the current resource preview.
6. Download and validate only the selected resources' required files.
7. Remap package-local ids.
8. Commit the selected folder trees and resources atomically.

A one-resource package skips the selection page.

## Publisher requirements

Production import links from the asset store and every redirected manifest or
file URL must use HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1`, and `::1`
testing.

Publishers should:

- return the manifest as `application/json` or a JSON `+json` type
- enable CORS for supported RouteVN Creator origins
- avoid third-party-cookie requirements
- use public or package-scoped signed URLs for protected packages
- keep signed URLs valid long enough for review and download
- return a compatible content type for every file

Packaged Tauri builds allow HTTPS network and preview media requests through
their configured CSP.

## Limits and validation

The importer treats every package as untrusted input. It rejects unsupported
schema or package kinds, unknown repository roots or fields, malformed trees,
duplicate or missing items, invalid ids, dangling dependencies, project-only
references, mismatched media types, and packages with no resources.

Current limits are:

- 2 MiB per manifest
- 2,000 package files
- 50 MiB per file
- 200 MiB total per import
- 500 resources per collection
- 32 folder-tree levels
- three parallel downloads
- 15-second manifest timeout
- 30-second file timeout

The creator validates the final manifest against importer limits before writing
the ZIP.
