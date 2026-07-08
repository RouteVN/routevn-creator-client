# RouteVN Packager Roadmap

Scope date: April 13, 2026

This roadmap is for the first implementation of `routevn-packager`.

Current scope is desktop only:

- Windows
- macOS
- Linux

Not in scope for this roadmap:

- Android
- iOS
- Steam integration
- Store submission automation
- Code signing automation beyond basic hook points

## Objective

Build a CLI that takes a RouteVN export zip and produces desktop-native builds through Tauri.

Target command:

```bash
routevn-packager build ./my-game.zip --out ./dist
```

Expected zip contents:

- `index.html`
- `main.js`
- `package.bin`

## Working Decisions

- Implementation language: Rust
- Native packaging layer: Tauri 2.x
- Integration style: shell out to `cargo tauri ...`
- Packaging model: reusable committed Tauri shell project plus generated config overrides
- First milestone: desktop packaging only

## Success Criteria For v1

`routevn-packager` v1 is done when:

- a user can package a valid RouteVN export zip from the CLI
- the CLI validates input and fails with clear errors
- metadata can be supplied for title, identifier, and version
- icons can be supplied and injected into the desktop build
- Linux packaging works on Linux
- Windows packaging works on Windows
- macOS packaging works on macOS
- produced apps load the RouteVN runtime without changing the exported web payload
- the repo has docs, tests for the non-build logic, and a repeatable local development workflow

## Non-Goals For v1

- cross-building every platform from one host
- automatic notarization or store upload flows
- Android and iOS packaging
- Steam-specific packaging or metadata
- a stable plugin system for third-party stores

## Architecture Snapshot

Planned structure:

```text
routevn-packager/
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── zip.rs
│   ├── manifest.rs
│   ├── metadata.rs
│   ├── tauri.rs
│   ├── targets.rs
│   ├── artifacts.rs
│   └── errors.rs
├── tauri-shell/
│   ├── src-tauri/
│   └── frontend placeholder
├── fixtures/
│   └── sample RouteVN export zips
└── docs
```

Operational model:

1. Read CLI arguments.
2. Validate and extract the zip to a temp workspace.
3. Validate required RouteVN files.
4. Prepare a Tauri build workspace.
5. Generate Tauri config overrides and icons.
6. Run `cargo tauri build`.
7. Collect output artifacts into `--out`.

## Delivery Phases

## Phase 0: Foundations

Goal:
Create the repo shape and core development workflow.

Checklist:

- [ ] Initialize a Rust binary crate for `routevn-packager`
- [ ] Add core dependencies for CLI parsing, zip handling, temp dirs, JSON/TOML, and error handling
- [ ] Add logging and structured error reporting
- [ ] Define module boundaries for CLI, zip validation, metadata, Tauri orchestration, and artifact collection
- [ ] Create a minimal `tauri-shell/` directory that will act as the reusable native wrapper project
- [ ] Add a sample fixture zip for local testing
- [ ] Add a simple Makefile or script aliases for common dev tasks

Exit criteria:

- the project builds
- there is a clear folder structure
- local contributors can run one command to start development tasks

## Phase 1: Tauri Shell Prototype

Goal:
Prove that a static RouteVN web export can run inside a minimal desktop Tauri shell.

Checklist:

- [ ] Create a minimal Tauri 2 shell project under `tauri-shell/`
- [ ] Configure the shell so `build.frontendDist` can be overridden at build time
- [ ] Keep `beforeBuildCommand` empty for packaged RouteVN exports
- [ ] Validate that the shell can load an extracted RouteVN export without modifying `index.html`, `main.js`, or `package.bin`
- [ ] Confirm desktop bundles can be produced from the shell on the current host
- [ ] Record any runtime compatibility issues with asset paths or binary loading

Exit criteria:

- a manually staged RouteVN export builds successfully through Tauri
- the packaged app launches and loads the RouteVN content correctly

## Phase 2: Core CLI Flow

Goal:
Automate the basic package flow end to end.

Checklist:

- [ ] Implement `routevn-packager build <zip> --out <dir>`
- [ ] Add zip extraction to a temp directory
- [ ] Validate that `index.html`, `main.js`, and `package.bin` exist
- [ ] Fail with clear error messages for invalid zips
- [ ] Create a build workspace per run so concurrent builds do not collide
- [ ] Invoke `cargo tauri build` from the CLI
- [ ] Copy or move generated desktop artifacts into the requested output directory
- [ ] Print a final artifact summary to the terminal

Exit criteria:

- a valid zip can be packaged from one command
- output artifacts appear under `--out`
- invalid input errors are understandable

## Phase 3: Metadata Model

Goal:
Support the minimum app metadata needed for desktop packaging.

Checklist:

- [ ] Define a RouteVN packager config format, likely JSON or TOML
- [ ] Support metadata from CLI flags
- [ ] Decide precedence between config file values and CLI flags
- [ ] Map metadata into Tauri config overrides
- [ ] Support at least `title`, `identifier`, and `version`
- [ ] Normalize and validate identifiers per platform constraints
- [ ] Add friendly validation messages for missing required metadata

Exit criteria:

- users can package with custom app metadata
- Tauri config overrides are generated automatically per build

## Phase 4: Icons And Desktop Assets

Goal:
Handle desktop-facing branding inputs cleanly.

Checklist:

- [ ] Support a master icon input file
- [ ] Generate Tauri icons through `cargo tauri icon` or an equivalent documented workflow
- [ ] Store generated icon outputs in the staged build workspace
- [ ] Wire `bundle.icon` into generated config overrides
- [ ] Define how app title and icon assets are provided in config
- [ ] Validate missing or malformed icon assets early
- [ ] Document icon input requirements

Exit criteria:

- users can package a build with custom icons
- icons appear correctly in desktop outputs

## Phase 5: Desktop Target Handling

Goal:
Make platform support explicit and predictable.

Checklist:

- [ ] Add `--target` support with `windows`, `linux`, and `macos`
- [ ] Detect current host OS and fail early for unsupported local targets
- [ ] Document the host-to-target limitations clearly
- [ ] Decide whether the default target is host-only or all supported targets on the host
- [ ] Collect platform-specific artifact paths for each desktop target
- [ ] Add target-specific smoke test instructions

Exit criteria:

- the CLI can package for the intended host-supported desktop targets
- unsupported target requests fail before expensive build work starts

## Phase 6: Artifact Handling And UX

Goal:
Make the tool usable in real workflows.

Checklist:

- [ ] Standardize output directory layout
- [ ] Include build logs or log-file paths in the final output
- [ ] Show generated artifact names and locations
- [ ] Return non-zero exit codes for failed packaging runs
- [ ] Clean up temp directories by default
- [ ] Add a `--keep-temp` option for debugging
- [ ] Add a `--verbose` mode

Exit criteria:

- build output is easy to find
- failures are diagnosable without reading source code

## Phase 7: Testing And Quality Gates

Goal:
Cover the non-trivial logic and keep regressions visible.

Checklist:

- [ ] Add unit tests for zip validation
- [ ] Add unit tests for metadata normalization and config merging
- [ ] Add unit tests for target resolution and host validation
- [ ] Add snapshot or fixture tests for generated Tauri config overrides
- [ ] Add at least one end-to-end desktop packaging smoke test
- [ ] Add CI checks for formatting, linting, and tests
- [ ] Decide how much Tauri build validation runs in CI versus local/manual testing

Exit criteria:

- core packaging logic is test-covered
- contributors can detect obvious regressions before release

## Phase 8: Documentation And Release Readiness

Goal:
Make the first desktop release usable by other developers.

Checklist:

- [ ] Update README with actual install and usage instructions
- [ ] Document required host dependencies for Linux, Windows, and macOS builds
- [ ] Document the config file format with examples
- [ ] Document icon requirements and packaging limitations
- [ ] Document known platform-specific issues
- [ ] Create a release checklist for tagging and artifact verification

Exit criteria:

- a new contributor can set up the tool and produce a desktop package from documentation alone

## Suggested Execution Order

Recommended order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8

Fastest proof-of-value path:

1. Build the Tauri shell
2. Prove manual desktop packaging works
3. Automate the CLI happy path
4. Add metadata and icon support
5. Add tests and docs

## Risks To Watch

- `package.bin` may rely on assumptions that differ between browser hosting and Tauri packaging
- Tauri bundle output paths differ by platform and can be annoying to normalize
- desktop packaging still depends on per-host native toolchains
- icon generation and naming can be platform-sensitive
- macOS packaging will require a macOS host even for desktop-only scope

## Definition Of Ready For Implementation

Before coding begins, these decisions should be fixed:

- [ ] final CLI command shape for `build`
- [ ] initial config file format
- [ ] metadata field names and required fields
- [ ] default target behavior
- [ ] location and ownership of the committed Tauri shell project
- [ ] fixture strategy for sample RouteVN exports

## Definition Of Done For First Desktop Release

- [ ] `routevn-packager build <zip> --out <dir>` works on at least one desktop host end to end
- [ ] the packaged app launches and loads the RouteVN export correctly
- [ ] metadata overrides work
- [ ] custom icons work
- [ ] output artifacts are copied into a predictable directory layout
- [ ] invalid inputs fail clearly
- [ ] core non-build logic is tested
- [ ] the repo docs explain how to use and develop the tool
