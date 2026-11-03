# Reference asset packages

Each folder here holds what an exported asset package ZIP contains:
`asset-package.json` and its `files/<fileId>` entries. The folders are grouped
by package schema: `v2/` holds `routevn.import-pack.v2` packages.

| Case           | What it covers                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all-types`    | A picked folder for every resource type the export supports, a nested folder, files, generated previews, and references between the picks, including inside previews, element conditions (`$when` and overrides), computed variable examples and particle textures. |
| `dependencies` | Picks that use resources outside the picked folders, so the package carries them as dependencies, including through other dependencies, a transform preview's character, conditions, example inputs and preview variable values.                                    |
| `links`        | Picks and a dependency that jump to story sections and scenes or open layouts the package does not carry, which become links, and a layout the package carries.                                                                                                     |
| `nested-picks` | Folders picked inside others: one in an unpicked folder, which becomes a top-level folder and brings what it uses as a dependency, one two folders deep, and one inside another pick, which comes with that pick once, in pick order.                               |

## Rules

- The files are generated, never edited by hand. Change the source projects
  in `scripts/generate-asset-package-fixtures.js` and run
  `bun run generate:asset-package-fixtures`.
- `tests/assetPackage/assetPackageFormat.export.test.js` builds every case
  again and requires the committed files to match exactly, so any change to
  what the exporter writes shows up here as a diff to review.
- Once an app release ships a schema, its folder is frozen: its files never
  change again.
- A change to the format after that needs a new schema string and a new
  folder next to the old one. The generator writes to the folder of the schema
  the exporter writes.
- The importer must keep importing every frozen folder:
  `tests/assetPackage/assetPackageFormat.import.test.js` imports every case
  folder found here.
