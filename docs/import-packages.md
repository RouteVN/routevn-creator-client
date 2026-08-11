# Import Packages

## Purpose

This document defines the initial RouteVN import package shape and the asset
store import-link flow.

The implementation and release-hardening work is tracked in
[Import Packages Production Readiness Checklist](./import-packages-production-readiness.md).

Import packages let users import reusable project resources from a copied URL.
Animation and transform packages import one primary resource type at a time.
Asset packages can combine every user-facing project resource collection:
images, sounds, videos, characters, transforms, animations, particles,
spritesheets, colors, fonts, text styles, layouts, variables, and controls.

## Shape

An import package is a wrapper around a partial repository.

```json
{
  "schema": "routevn.import-pack.v1",
  "package": {
    "id": "example.fx-pack",
    "name": "FX Pack",
    "version": "1.0.0",
    "defaultFolderName": "FX Resources",
    "description": "Particles, textures, and transition animations."
  },
  "repository": {
    "files": {
      "items": {}
    },
    "images": {
      "items": {},
      "tree": []
    },
    "transforms": {
      "items": {},
      "tree": []
    },
    "animations": {
      "items": {},
      "tree": []
    },
    "particles": {
      "items": {},
      "tree": []
    }
  }
}
```

Only included repository roots are imported.

The package should reuse RouteVN's normal `{ items, tree }` collection shape.
Folders are normal items with `type: "folder"`; there is no separate `folders`
section and no separate `resources` array.

## Package-Local IDs

All ids inside the package are package-local ids.

They may appear in normal repository fields such as `id`, `fileId`,
`thumbnailFileId`, `imageId`, `texture`, `resourceId`, `transformId`,
`animationId`, and `particleId`.

During import, the client maps package-local ids to real project ids.

```text
file.spark -> generated-file-id
image.spark -> generated-or-existing-image-id
transform.center -> generated-transform-id
```

Saved project data must contain real project ids only.

Scene, section, and line ids are project-owned rather than package-local
resources. Asset packages cannot contain `sceneId`, `sectionId`, `lineId`, or
their plural forms while story content is not packageable. The creator rejects
such exports, and the importer rejects manifests containing them.

## Files

File-backed resources point to `repository.files.items` records. File records
extend the normal file metadata with import-only `source` data.

```json
{
  "repository": {
    "files": {
      "items": {
        "file.spark": {
          "id": "file.spark",
          "type": "image",
          "mimeType": "image/png",
          "sha256": "optional",
          "source": {
            "url": "assets/spark.png"
          }
        }
      }
    }
  }
}
```

`source.url` may be absolute or relative to the manifest URL. If `sha256` is
present, the importer should verify the downloaded bytes.

The asset package creator downloads a ZIP with this layout:

```text
asset-package.json
files/<package-local-file-id>
```

The creator's package information edit dialog supplies the manifest package
`id`, `name`, `version`, and optional `description` values. The page displays
the saved values in a read-only summary. Creator-generated manifests also set
`package.kind` to `routevn.creator.asset-package`; this explicit marker selects
the generalized asset importer without relying on the mix of resource roots in
the package.

The `asset-package.json` manifest uses relative `source.url` values that point
to the corresponding entries under `files/`. After extracting the archive, the
folder can be served directly from a static file server.

## Resource Preview Media

Animation, transform, sound, particle, spritesheet, font, and text-style items
may reference package-only preview media with `previewMediaFileId`. Generated
previews may also use `thumbnailMediaFileId` for a smaller review image or
video. These ids must reference records in
`repository.files.items` whose MIME type is `image/jpeg`, `image/png`,
`image/webp`, `video/mp4`, or `video/webm`.

```json
{
  "id": "animation.transition",
  "type": "animation",
  "name": "Transition",
  "previewMediaFileId": "file.transition-preview",
  "animation": { "type": "update", "tween": {} }
}
```

Preview media is fetched through the same bounded, timed, hash-verifying client
as imported files. The review UI requests previews only for the resource being
customized rather than mounting every package preview on the selection page.
Preview media is displayed in a 16:9 frame during import review. Video previews
autoplay muted, loop, and play inline. The importer prefers
`thumbnailMediaFileId` when present. Both preview fields are import-only
metadata: they are not persisted on the imported resource and are not
downloaded as project assets unless another retained resource field also
references the same file.

When the asset package creator exports sounds that have waveform metadata, it
generates a 640 by 360 PNG waveform preview inside the ZIP and assigns it as
the sound's `previewMediaFileId`. This changes only the exported manifest and
does not add a thumbnail to the source project.

The creator also generates package-only previews for these resources:

- animations: full-resolution videos containing one complete animation cycle
  rendered with the animation's configured preview images and project
  resolution, plus videos derived from those completed full previews and
  scaled to fit within 640 by 360 pixels
- particles: full-resolution and lower-resolution short videos of the existing
  particle preview
- spritesheets: full-resolution and lower-resolution videos containing one
  complete cycle of the first animation, matching the page's default clip
  selection and configured FPS
- fonts: a 1920 by 1080 PNG containing the Fonts page glyph set, plus a 640 by
  360 PNG thumbnail of the existing `Aa` preview
- text styles: a 960 by 270 PNG using the preview text, font, colors, stroke,
  and shadow shown by the existing text-style preview, plus a 427 by 120 PNG
  thumbnail

Depending on the desktop WebView's supported canvas recording codec, generated
videos use MP4 or WebM. None of these generated files are written to the source
project.

## Folders

The import flow asks the user to choose an existing destination folder or name
a new destination folder for each imported resource type and for file-backed
dependencies such as images or sounds. A requested new folder is created at the
collection root in the same atomic command batch as the imported resources.

```json
{
  "transforms": {
    "items": {
      "transform.center": {
        "id": "transform.center",
        "type": "transform",
        "name": "Center",
        "x": 960,
        "y": 540,
        "scaleX": 1,
        "scaleY": 1,
        "anchorX": 0.5,
        "anchorY": 0.5,
        "rotation": 0
      }
    },
    "tree": [{ "id": "transform.center" }]
  }
}
```

Default animation and transform import behavior:

- show `New Folder` before `Existing Folder` when existing folders are available
- default to `New Folder` even when the collection has existing folders
- seed new resource and dependency folder names from
  `package.defaultFolderName`, falling back to `package.name`
- require a folder name when creating a destination
- append imported items to the selected folder
- do not add a synthetic `Root` folder option
- do not create or mirror a package folder tree automatically
- skip resource types with no imported items
- do not move existing project resources selected as substitutions

Package folders may still be present in future generalized packages, but the
first importer treats them as package organization only. The user-selected new
destination is a single project folder, not a recreation or merge of the
package tree.

The asset package creator exposes only top-level source folders. Selecting one
serializes its complete subtree, including nested folders and resources, while
preserving the selected root order and all ordering within each subtree.
Creator exports retain the explicit `routevn.creator.asset-package` package
kind, but omit `package.id`, `package.name`, `package.version`, and
`package.description`. Publishing/catalog systems may supply that information
separately without changing the creator project.
The asset package importer recreates the selected resources' complete package
folder ancestry in each matching project collection. Package-local file and
resource references are remapped before import, including nested references and
dependencies between collections. Export automatically includes the transitive
resource and file dependencies of every selected subtree. All files, folders,
and resources are committed in one atomic command batch.

## Media Substitution

Users should always be able to replace file-backed resources during import.

The package describes default media. The local import session decides whether a
media resource is imported, renamed, skipped, or mapped to an existing project
resource.

This local choice is not part of the package format.

```json
{
  "resourceChoices": {
    "image.spark": {
      "mode": "existing",
      "projectResourceId": "existing-image-id"
    }
  }
}
```

If a package image is mapped to an existing image, dependent resources should use
the existing project image id and the client should avoid downloading unused
default files.

## Asset Store Import Links

The asset store should expose a stable import link for each importable package.
The user copies this link and pastes it into RouteVN Creator.

Expected flow:

1. The user opens the asset store.
2. The user copies an import link for one asset or pack.
3. The user pastes the link into RouteVN Creator.
4. The client fetches the import package manifest.
5. For a multi-resource package, the client shows a visual selection page with
   a preview for each resource. A one-resource package skips this page.
6. The client shows one customization page per selected resource, including its
   package preview, name, and referenced-media choices.
7. The user moves through the selected resources with Next, chooses placement
   on the final page, and submits all choices together.
8. The client imports the resolved resources into the current project.

Basic URL contract:

```text
GET https://assets.routevn.example/import/example.fx-pack
Accept: application/json
```

Response:

```http
Content-Type: application/json
```

The response body is a `routevn.import-pack.v1` package.

The import link may point directly to the manifest or redirect to the manifest.
The link should identify one importable package, not a general catalog page.

## Auth

Public packages can use unauthenticated links.

For authenticated packages, prefer a signed import link generated by the asset
store after the user logs in or purchases the asset.

```text
https://assets.routevn.example/import/example.fx-pack?token=...
```

The token should authorize fetching the manifest and protected file URLs. It
should be scoped to one package and may expire.

The first implementation should not require RouteVN Creator to understand the
asset store's full account system. Full first-party account auth can be added
later with authorization headers if needed.

The client should not rely on browser cookies from the asset store page,
especially in the desktop app.

## Publisher HTTP Requirements

Package publishers should expose a stable GET endpoint that can be fetched from
RouteVN Creator's supported web and desktop origins.

- Return the manifest with `Content-Type: application/json` (a JSON `+json`
  type is also accepted).
- Enable CORS for the RouteVN Creator origin. Public development fixtures may
  use `Access-Control-Allow-Origin: *`; authenticated production endpoints
  should allow only the intended app origins.
- Redirects are allowed, but every final manifest and file URL must still use
  HTTPS. HTTP is accepted only for localhost test servers.
- Relative file URLs are resolved against the final manifest URL after
  redirects.
- File responses should return the MIME type declared by the manifest, or
  `application/octet-stream`. Contradictory declared/response types are
  rejected.
- Do not require third-party cookies. Use public URLs or package-scoped signed
  manifest/file URLs.
- Keep signed URL expiry long enough for review plus download. An expired link
  returns the normal authorization/not-found import error and can be retried
  with a newly issued link.
- Support request cancellation and avoid caching personalized manifests unless
  the URL is safely content-addressed. The client itself requests `no-store`.
- Stay within the documented client limits below. `Content-Length` helps the
  client reject oversized responses early, but streaming limits are enforced
  even when the header is absent or incorrect.

The local fixture server in this repository is an executable publisher example:

```bash
bun run serve:import-test-data
```

## Validation

The client should treat import links as untrusted network input:

- fetch with explicit size limits
- require a supported `schema`
- resolve relative file URLs against the manifest URL
- validate all files through normal upload/file-type rules
- verify hashes when `sha256` is provided
- show stable user-facing errors for network, auth, validation, and file failures

Recommended initial errors:

- `Package could not be loaded.`
- `This package format is not supported.`
- `This package requires authorization.`
- `A package file could not be downloaded.`
- `A package file has an unsupported type.`
- `A package file failed integrity validation.`

## Production Decisions

The production URL workflow uses these rules:

- the public URL path requires `routevn.import-pack.v1`; raw collections and
  single resource objects are not accepted
- HTTPS is required, except that HTTP is accepted for `localhost`, `127.0.0.1`,
  and `::1` test servers
- redirects are accepted only when their final URL passes the same policy
- signed package and file URLs are supported; the client does not send asset
  store cookies or account authorization headers
- all animations or transforms in the requested collection are shown in review
  and selected by default; `primary` is shown and committed first
- resource previews prefer `previewMediaFileId`; when it is absent, the client
  uses the first referenced package image with a resolvable file URL, then a
  neutral fallback
- re-import creates a new copy without overwriting an existing same-name
  resource
- tags are reused by case-insensitive name in the matching scope or created in
  the same atomic import batch
- import receipts are not persisted in project state in v1
- referenced package tags, images, and files must be present and valid
- users may select an existing destination or create one named folder per
  imported collection; new folders use plan-stable ids and are committed in the
  same atomic batch, while package folder trees remain organizational only

Current limits are 2 MiB per manifest, 100 files, 50 MiB per file, 200 MiB per
import, 500 resources per collection, 32 tree levels, three parallel downloads,
a 15 second manifest timeout, and a 30 second file timeout.

## Current Production Flow

The animations and transforms pages use one shared workflow:

1. Load and validate a strict package manifest.
2. If the package contains multiple target resources, review visual previews
   and select which resources to import. Skip this page for one target resource.
3. Customize each selected resource on its own page. The page shows the resource
   preview, editable name and description fields, destination controls, and
   previews for its referenced images.
4. For each referenced image, either import the package image or replace it with
   an existing project image. Replaced media is not downloaded.
5. On the last selected resource, submit all accumulated choices together.
6. Download selected files with bounded streaming and SHA-256 verification.
7. Process and stage images and derived thumbnails under the plan id.
8. Preflight and submit file, destination-folder, tag, image, and
   target-resource commands as one command batch.
9. Delete staged blobs after cancellation or pre-commit failure. If commit
   confirmation is interrupted, retain blobs and allow an idempotent retry to
   recognize an already committed plan.

The page-specific implementation supports animation and transform target
resources with image dependencies. Other repository roots are reported as
skipped content in that legacy review plan rather than imported implicitly. A
multi-resource asset package uses the generalized asset plan and supports every
user-facing resource collection listed above.

## Local Test Server

Run the deterministic import-package server with:

```bash
bun run serve:import-test-data
```

It listens on `http://127.0.0.1:4179` by default. Override the bind values with
`ROUTEVN_IMPORT_TEST_HOST` and `ROUTEVN_IMPORT_TEST_PORT`.

Useful URLs:

- `/import/transforms` and `/import/animations`: redirecting import links
- `/manifests/transforms.json`: two transforms sharing one replaceable image
- `/manifests/animations.json`: two animations with a replaceable mask image
- `/manifests/integrity-failure.json`: deliberate SHA-256 failure
- `/files/slow-pixel.png`: delayed file response for cancellation testing
- `/status/401`, `/status/404`, `/status/500`: stable HTTP failure cases
