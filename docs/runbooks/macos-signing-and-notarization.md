# macOS Signing And Notarization

This runbook covers the public macOS release flow for RouteVN Creator.

The repository is public. Never commit real Apple credentials, app-specific
passwords, or private keys. Keep secrets in a local `.env`, which is ignored by
git.

## Concepts

`Developer ID Application`

- The Apple certificate used to sign the app for distribution outside the Mac
  App Store.

`.app`

- The actual macOS application bundle.
- Tauri builds and signs this first.
- Apple notarization checks this bundle when Tauri submits it during the build.

`.dmg`

- The installer-style disk image that contains the `.app`.
- This is the file we distribute to end users.
- Because users download and open the `.dmg`, we also notarize and staple the
  final `.dmg`.

## Local Setup

1. Install the `Developer ID Application` certificate in Keychain.
2. Confirm macOS can see the signing identity:

```bash
security find-identity -v -p codesigning
```

3. Copy `.env.example` to `.env`.
4. Fill in local-only values:

```env
APPLE_SIGNING_IDENTITY="Developer ID Application: Example Company, Inc. (TEAMID1234)"
APPLE_ID="your-apple-account-email@example.com"
APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="TEAMID1234"
```

Field meaning:

- `APPLE_SIGNING_IDENTITY`: exact Keychain identity name from
  `security find-identity -v -p codesigning`
- `APPLE_ID`: Apple account email used for notarization
- `APPLE_PASSWORD`: app-specific password, not the normal Apple account password
- `APPLE_TEAM_ID`: Apple Developer team id

## Build Flow

Run:

```bash
bun run tauri:build:mac
```

That command uses [`scripts/tauri-build-mac.sh`](../../scripts/tauri-build-mac.sh).

The script does this:

1. Loads local values from `.env`
2. Builds the Tauri frontend bundle
3. Builds the macOS app bundle
4. Signs the `.app`
5. Lets Tauri notarize and staple the `.app`
6. Builds the final `.dmg`
7. Signs the `.dmg`
8. Submits the `.dmg` with `xcrun notarytool`
9. Staples the notarization ticket to the `.dmg`
10. Validates the stapled `.dmg`

## Final Artifact

Send this file to end users:

`src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg`

Do not send the raw `src-tauri/target/.../RouteVN Creator.app` as the default
public download unless you intentionally want app-bundle distribution.

## Verification

Check the final `.dmg`:

```bash
codesign --verify --verbose=4 'src-tauri/target/universal-apple-darwin/release/bundle/dmg/RouteVN Creator_1.0.0-rc6_universal.dmg'
xcrun stapler validate 'src-tauri/target/universal-apple-darwin/release/bundle/dmg/RouteVN Creator_1.0.0-rc6_universal.dmg'
spctl -a -vvv -t install 'src-tauri/target/universal-apple-darwin/release/bundle/dmg/RouteVN Creator_1.0.0-rc6_universal.dmg'
```

Expected results:

- `codesign`: valid on disk
- `stapler validate`: validate action worked
- `spctl`: accepted, source=`Notarized Developer ID`

## Common Issues

`0 valid identities found`

- The certificate is not installed correctly in Keychain, or macOS cannot use
  it for code signing yet.

`ambiguous` signing identity

- Keychain contains multiple matching certificates with the same display name.
- Remove the duplicate certificate or clean up stale Keychain entries.

`Unnotarized Developer ID`

- The artifact is signed but not notarized, or the notarization ticket was not
  stapled to the final download artifact.
- For RouteVN Creator, both the `.app` and final `.dmg` should end up notarized.

`stapler validate` fails on the `.dmg`

- The `.dmg` was never submitted to notarization, or the stapling step failed.
- Re-run `bun run tauri:build:mac` after confirming `.env` has all Apple values.

## Security Rules

- Never commit `.env`
- Never commit real `APPLE_PASSWORD`
- Never commit real Apple account emails unless they are meant to be public
- Never commit private signing keys or exported `.p12` files

## References

- Tauri macOS signing and notarization:
  https://v2.tauri.app/distribute/sign/macos/
- Apple Developer ID overview:
  https://developer.apple.com/developer-id/
- Apple app-specific passwords:
  https://support.apple.com/en-us/102654
