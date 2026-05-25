# Import Packages

## Purpose

This document defines the initial RouteVN import package shape and the asset
store import-link flow.

Import packages let users import reusable project resources from a copied URL.
The first implementation can support one resource type at a time, but the
package shape should stay general enough for images, sounds, videos, fonts,
spritesheets, transforms, animations, particles, colors, text styles, layouts,
controls, and variables.

## Shape

An import package is a wrapper around a partial repository.

```json
{
  "schema": "routevn.import-pack.v1",
  "package": {
    "id": "example.fx-pack",
    "name": "FX Pack",
    "version": "1.0.0",
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

## Folders

Packages should not create destination folders by default. The import flow asks
the user to choose a destination folder for each imported resource type and for
file-backed dependencies such as images or sounds.

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

Default import behavior:

- show only existing project folders as destination choices
- require a real destination folder for each imported resource type
- append imported items to the selected folder
- do not add a synthetic `Root` folder option
- do not create a package root folder
- skip resource types with no imported items
- do not move existing project resources selected as substitutions

Package folders may still be present in future generalized packages, but the
first importer should treat them as package organization only unless a later
flow explicitly supports folder creation or merging.

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
5. The client shows an import review flow.
6. The user confirms placement, renames, and media substitutions.
7. The client imports the resolved resources into the current project.

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

## MVP Scope

The first implementation can support a narrow path:

- paste an absolute `http` or `https` package URL
- import transform packages and animation packages by URL
- accept either a full import package, a resource collection, or a single
  resource item for the supported resource type
- let the user choose the destination resource folder before importing
- download image dependencies and let the user choose the destination image
  folder when image dependencies exist
- rewrite imported transform preview image references and animation mask image
  references to the newly imported images
- skip substitutions and generalized multi-resource import for now

Future iterations can broaden this to package-level folder import, existing
resource substitution, and additional resource types.
