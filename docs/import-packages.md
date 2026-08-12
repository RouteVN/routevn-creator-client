# Asset Package Import

## Purpose

RouteVN Creator imports reusable resources from a strict Asset Package manifest.
The old animation-only and transform-only package formats are not supported.

An Asset Package may contain images, sounds, videos, characters, transforms,
animations, particles, spritesheets, colors, fonts, text styles, layouts,
variables, and controls. The creator currently excludes layouts from its export
picker.

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
the matching project collections. It does not ask for replacement destination
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

## Import flow

1. Load and strictly validate the manifest.
2. Show a selection page when the package contains multiple resources.
3. Keep required dependencies selected and locked.
4. Let the user review and edit each selected resource's name and description.
5. Lazily load the current resource preview.
6. Download and validate only the selected resources' required files.
7. Remap package-local ids.
8. Commit the selected folder trees and resources atomically.

A one-resource package skips the selection page.

## Publisher requirements

Production import links and every redirected manifest or file URL must use
HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1`, and `::1`
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
