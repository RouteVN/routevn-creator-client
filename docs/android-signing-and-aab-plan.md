# Android Signing And App Bundle Plan

Status: proposed, not implemented. This plan builds on the unsigned APK export
described in `docs/platform/15-android-player-export.md` and
`docs/android-player-export-plan.md`.

Date baseline: November 12, 2026.

## Goal

Let a creator go from a release to a file they can install or publish, without
installing the Android SDK or a JDK:

- **Phase 1:** sign APKs on the device, and export Android App Bundles (AAB)
  for Google Play, signed on the device. No RouteVN service is involved.
- **Phase 2:** optionally sign APKs with a key held by a RouteVN service under
  the creator's account, so a lost device does not mean a lost key.

The unsigned APK export stays available and unchanged.

## Options

| Key source                             | APK     | AAB     | Runs on        |
| -------------------------------------- | ------- | ------- | -------------- |
| Unsigned                               | Exists  | Phase 1 | Device         |
| Create Key: new key made by Creator    | Phase 1 | Phase 1 | Device         |
| Upload Key: the creator's own keystore | Phase 1 | Phase 1 | Device         |
| Managed cloud key (account)            | Phase 2 | No      | Device+service |

Managed cloud keys are not offered for AAB. An AAB is signed with an upload
key, and Google Play can reset a lost upload key without affecting players, so
cloud custody adds little there. An APK signing key cannot be reset: if it is
lost, players must uninstall the game, losing their saves, to install a newer
release.

## Background

- **APK:** the file Android installs. Android refuses an unsigned APK and
  installs an update only when it is signed with the same key as the installed
  version. For APKs distributed outside Google Play, the signing key is the
  game's permanent identity.
- **AAB:** a publishing format that only app stores accept. It cannot be
  installed on a device. Google Play requires it for new apps. With Play App
  Signing, Google holds the app signing key and builds and signs the APKs that
  players install. The key the creator signs the AAB with is only an **upload
  key**, which proves the upload came from the creator.
- A game installed from Google Play and the same game installed from a
  self-signed APK have different signatures. A player cannot switch between
  the two without reinstalling. User-facing docs must say so.

## Phase 1: On-Device Signing And AAB

### Product Contract

The Android export asks for a format and a signing option:

| Format | Signing                 | Output file                          |
| ------ | ----------------------- | ------------------------------------ |
| APK    | Created or uploaded key | `<game-name>-<version>.apk`          |
| APK    | Unsigned                | `<game-name>-<version>-unsigned.apk` |
| AAB    | Created or uploaded key | `<game-name>-<version>.aab`          |
| AAB    | Unsigned                | `<game-name>-<version>-unsigned.aab` |

- default: a signed APK; a game that has no key yet asks the creator to
  create or upload one (see Signing Keys)
- supported hosts: the same as unsigned APK export (Creator desktop on
  Windows, macOS, and Linux, the Creator Android app, and the Creator iOS
  app); the web Creator does not export
- no host runs Gradle, the Android SDK, `bundletool`, `apksigner`,
  `jarsigner`, `keytool`, a JDK, or a network service
- a signed APK installs directly; a signed AAB is ready to upload to Play
  Console
- unsigned outputs are for creators who sign with their own tools

There is no separate debug or test build. A signed APK is the way to try a
game on a phone.

### Signing Keys

A signed export needs a key for the game. The creator gets one in one of two
ways:

- **Create Key:** Creator makes a new key on this device. This is the choice
  for a game that has never been signed.
- **Upload Key:** the creator chooses a keystore file they already have: a key
  made with Android Studio or `keytool`, the key of a game they already
  publish, or a backup made by Creator. Creator reads the file on this device
  and keeps the key in its device key store. In Phase 1 the file is not sent
  anywhere.

Creator never makes a key without asking. When a signed export finds no key
for the game, the export dialog offers Create Key and Upload Key before the
export starts, with Create Key selected. The Signing Key section in Platform
Details offers the same two choices.

By default one key signs both the APKs and the App Bundles of a game. The
project records the key for each format separately, so a game can also use a
different key for each: for example after a Play Console upload key reset, or
when a creator already has a Play upload key and a separate key for APKs.

Create Key:

- RSA 2048 with SHA-256 and a self-signed X.509 certificate valid for 30
  years; Google Play requires an RSA key of at least 2048 bits and a validity
  ending after October 22, 2033 (confirm both against current Play
  documentation before release)
- the certificate subject is the application name; it must not be
  `CN=Android Debug`, which stores treat as a debug build
- made off the main thread; in the Phase 1a spike, a 2048-bit key took 0.1 to
  0.4 seconds on a low-end Android tablet and under 0.1 seconds on a desktop
- right after the key is made, Creator asks the creator to back it up (see
  Backup and transfer)

Upload Key:

- PKCS #12 keystores (`.p12`, `.pfx`, and `.keystore` or `.jks` files written
  by JDK 9 or later), with the keystore password, an optional separate key
  password, and, when a keystore holds several entries, a choice of alias
- both PKCS #12 encryptions that JDK versions write: the older one (3DES or
  RC2 with an HMAC-SHA1 MAC) and the current one (PBES2 with AES-256 and an
  HMAC-SHA256 MAC)
- only RSA keys of 2048 bits or more in the first release; other files are
  refused with a stable, user-facing error that names the reason (wrong
  password, unsupported key type, legacy JKS file)
- when the game already has a recorded fingerprint for the format, the
  uploaded key must match it; a different key is accepted only through
  Replace Key
- a creator whose game is already on Google Play must upload the existing
  Play upload key for App Bundles; Play rejects a bundle signed with any other
  key
- signing APKs with a Play upload key makes it the permanent identity of those
  APKs; resetting it in Play Console later does not help players who installed
  an APK, and the Upload Key step says so

Android Studio's New Key Store dialog has written legacy JKS files in some
versions. Check what current versions write before release, because it decides
how often the JKS refusal in Open Decision 5 applies.

In this plan, **Upload Key** is the Creator action above. Google Play's own
term, the **Play upload key**, is the key an App Bundle is signed with (see
Background); a key added with Upload Key may or may not be one.

Device key store:

- keys live in device-local application storage, outside every project folder
  and the project database
- on Android, keys stay outside `files/projects/`, so device-to-device
  transfer, the project backup folder, and project export never copy them;
  Android cloud backup already excludes all Creator app data
- on iOS, keys are excluded from device backup (Open Decision 6)
- keys are indexed by certificate SHA-256 fingerprint and labeled with the
  application ID and creation date; the fingerprint recorded in the project
  selects the key, so changing a project ID or application ID does not lose it
- each key is written to a temporary file and renamed into place, so an
  interrupted write never leaves a partial key
- the key store holds keys and their labels only; it is not a settings store,
  and settings stay in the app config API
- keys are never written to the project and never included in project export
  or import packages

Recorded fingerprints:

- the project records certificate fingerprints in its own project app-store
  key, `androidSigning`, with `apkCertificateSha256` and
  `bundleCertificateSha256`; a fingerprint is public information
- `androidSigning` is a separate key, not a field of `platformDetails.android`:
  released Creator versions normalize Platform Details by dropping fields they
  do not know, so editing Platform Details in an older version would erase a
  fingerprint stored there
- the record travels in the project database, so a project folder import or a
  restored project backup carries it to another device
- when no fingerprint is recorded for the chosen format, Creator offers the
  key recorded for the other format if this device has it, next to Create Key
  and Upload Key
- the key is saved in the device key store and its fingerprint recorded before
  the file is signed; if either write fails, the export stops with an error
- when a fingerprint is recorded and this device has no matching key, the
  export stops and explains that the game was signed with a different key,
  offering Upload Key for that key or Replace Key; Create Key is not offered
  for a format that already has a recorded fingerprint

Replacing a key:

- **Replace Key** creates or uploads a new key for one format and rewrites its
  recorded fingerprint, for a game that never shipped or a creator who accepts
  the consequence; it requires typing the application ID and explains that
  installed APKs cannot update to builds signed with the new key
- for App Bundles, this is the step after a Play Console upload key reset
- deleting a key from the device keeps the recorded fingerprint, so the next
  signed export asks to upload that key or replace it

Backup and transfer:

- **Back Up Key** exports a password-protected PKCS #12 file to a location
  the creator chooses, with the current encryption, which `keytool`,
  `apksigner`, and Gradle read
- right after Create Key, Creator asks for a backup and explains that a lost
  key cannot be recovered for APKs; until a backup is made, the Signing Key
  section in Platform Details keeps showing the reminder; which fingerprints
  have been backed up is remembered through the app config API, not the key
  store
- **Upload Key** with a backup file restores a key or moves it to another
  device
- **Export Certificate** writes the public certificate as a `.pem` file, which
  Play Console asks for when a creator requests a Play upload key reset

Creator assumes that uninstalling it on Android or iOS deletes its signing
keys, and does not rely on any platform store keeping them. The backup prompt
on mobile hosts says so.

### APK Signing

The exporter signs with APK Signature Scheme v2. The player's `minSdk` is 24,
so v1 JAR signing is not needed. v3 only adds key rotation and is out of
scope.

Signing is one more step after the existing export transaction writes and
validates the aligned unsigned APK:

1. digest the ZIP entries, the central directory, and the end-of-central-
   directory record in 1 MiB chunks with SHA-256, streaming from disk; the
   chunks are independent and can be digested in parallel
2. build the signed data: the digest, the certificate, and no additional
   attributes
3. sign it with RSASSA-PKCS1-v1_5 over SHA-256
4. insert the APK Signing Block before the central directory and update the
   central directory offset
5. reopen the APK, recompute the digest, reading the end-of-central-directory
   record's central directory offset as the APK Signing Block's offset as the
   scheme requires, and verify the signature with the certificate's public key
   before renaming the file into place

Memory stays bounded because the digest is streamed. Signing and verification
each read the whole APK, so both report progress like the other export steps.
The alignment the unsigned export already guarantees is preserved; nothing
realigns the file after signing. The ZIP64 refusal still applies.

Reference: <https://source.android.com/docs/security/features/apksigning/v2>.

### AAB Export

An AAB holds the same code, resources, and assets as the APK, but stores the
manifests and the resource table as protobuf, in per-module folders. The game
package goes in an install-time asset pack module, here called `gamepack`:

```text
BundleConfig.pb
base/manifest/AndroidManifest.xml       (protobuf XML)
base/resources.pb
base/res/...
base/dex/...
base/lib/<abi>/...
base/assets/...
gamepack/manifest/AndroidManifest.xml   (protobuf XML)
gamepack/assets/routevn-package.bin
```

Template:

- add the install-time asset pack module to the `android/player` Gradle
  project, holding a placeholder game package, and keep the package
  uncompressed with `noCompress`, so the bundle's `BundleConfig.pb` already
  lists it as uncompressed and the APKs Google builds keep it stored
- build a second template, `RouteVNPlayerTemplate.aab`, with
  `:app:bundleRelease`, unsigned
- extend the descriptor with the bundle's SHA-256, its image entries, and its
  color resources; template validation checks the asset pack module and the
  uncompressed rule, as it checks the APK template
- commit it next to the APK template and ship it to the same hosts

Player change, for both formats:

- the player opens the game package at the asset's offset inside
  `ApplicationInfo.sourceDir`, which is the base APK; an install-time asset
  pack is installed as a split APK, so that offset would point into the wrong
  file
- the player reads the package through the asset's own file descriptor
  instead, which works for an APK and for a split APK, and keeps that
  descriptor open for as long as the package is open
- the APK template is rebuilt with the same player

Export steps that differ from the APK export:

- rewrite the base and asset pack manifests by decoding and re-encoding the
  protobuf XML: in both, the package and every string derived from the
  template application ID; in the base manifest, also the label,
  `versionCode`, `versionName`, and `screenOrientation`
- each protobuf XML attribute stores a string `value` and a typed
  `compiled_item`; the rewrite updates both
- set the two colors by decoding and re-encoding `resources.pb`; there is no
  in-place offset patch
- write icons to the bundle's `base/res` entries
- replace the placeholder in the asset pack with the encrypted game package,
  stored; the player opens the package by file offset and cannot read a
  compressed asset
- write the ZIP without the APK alignment rules; Google Play aligns the APKs
  it builds

Package size:

- Google Play limits the compressed download size of the base module and of
  each asset pack. The Play Console help page lists 200 MB for a module,
  1.5 GB for one asset pack, and 4 GB in total; these numbers have changed
  over time and must be checked before implementation:
  <https://support.google.com/googleplay/android-developer/answer/9859372>
- visual novels often exceed the module limit, which is why the game package
  goes in an **install-time asset pack**: a second module in the same bundle
  that Play delivers together with the app, with no extra download step for
  the player
- a game package larger than one asset pack allows is refused with a stable,
  user-facing error in Phase 1; splitting a package across packs is a later
  improvement

AAB signing:

- an AAB is signed as a JAR: a `META-INF/MANIFEST.MF` listing a SHA-256 digest
  of every entry, a signature file digesting that manifest, and a PKCS #7
  signature block holding the certificate and an RSA signature
- digests are streamed, so memory stays bounded
- the exporter verifies its own signature before renaming the file into place

What the creator still does in Play Console, under their own Google account:

- create the app with the same application ID
- accept Play App Signing; Google generates and holds the app signing key
- upload the AAB; the key that signed the first upload becomes the upload key
- every later upload must use a higher Build Number and the same upload key

### Exporter And Host Changes

`crates/routevn-android-export` gains:

- key generation, PKCS #12 reading (Upload Key) and writing (Back Up Key),
  and certificate fingerprinting
- APK Signature Scheme v2 signing and verification
- JAR signing and verification for bundles
- protobuf manifest and resource table rewriting, and the bundle writer

New Rust dependencies cover RSA, X.509, PKCS #12, PKCS #7, and protobuf
encoding. There is no new JavaScript package, and the ordinary user's machine
still gains no separately installed dependency.

Each host adds a small device key store with these operations, exposed through
the shared project export facade:

```text
listAndroidSigningKeys       (certificates and labels on this device)
getAndroidSigningKey         (certificate for a fingerprint, if on this device)
createAndroidSigningKey      (Create Key)
importAndroidSigningKey      (Upload Key; the file stays on the device)
exportAndroidSigningKeyBackup
exportAndroidSigningCertificate
deleteAndroidSigningKey
createAndroidApkToPath       (gains a signing key fingerprint)
createAndroidBundleToPath
```

The decrypted private key never reaches JavaScript. Upload Key and Back Up
Key pass the keystore file and its password from the JavaScript UI to the
host, and the host never returns key material. The frontend refers to a key by its
fingerprint and receives only certificates, labels, and fingerprints.

### UI

Versions page, Android export dialog:

- **Format:** APK (install directly or share) or App Bundle (Google Play)
- **Signing:** signed or unsigned
- for a signed export of a game with no key: **Create Key** (selected) or
  **Upload Key**, shown in the dialog before the export starts; Upload Key
  opens the file picker and asks for the passwords and, when needed, the alias
- the notice changes with the choice: a signed APK can be installed; an App
  Bundle can only be uploaded to a store; an unsigned file must be signed
  before use
- the stop for a missing or different key, with Upload Key and Replace Key,
  described under Signing Keys

Platform Details, Android tab, a Signing Key section:

- for APKs and for App Bundles, the certificate fingerprint and creation date,
  or "no key on this device"
- with no key: Create Key and Upload Key
- with a key: Back Up Key, Replace Key, and Export Certificate, and a backup
  reminder until the key has been backed up
- deleting a key from the device requires typing the application ID

Add localized copy to every catalog in `src/i18n/` and keep
`scripts/check-i18n.js` passing. Document the `androidSigning` project key in
`docs/platform/06-project-identity-and-metadata.md` and
`docs/platform/07-persisted-key-catalog.md`, and the app config path that
remembers backed-up keys in `docs/platform/07-persisted-key-catalog.md`.

### Testing

Rust unit tests in CI:

- sign a fixture APK with a fixed key and compare against known bytes
- verification fails when any byte of the signed APK changes
- PKCS #12 round trip, both encryptions, a separate key password,
  wrong-password refusal, and rejection of unsupported key types
- protobuf rewrites of both manifests and of the colors, with no template
  application ID left and each attribute's value and compiled item in step
- bundle JAR signature round trip
- the asset pack size refusal

JavaScript unit tests in CI:

- `androidSigning` survives Platform Details edits
- a signed export of a game with no key asks for Create Key or Upload Key and
  makes no key until the creator chooses Create Key
- a recorded fingerprint with no matching key on the device stops the export,
  offers Upload Key and Replace Key, and never offers Create Key
- Upload Key refuses a key that does not match the recorded fingerprint
- Replace Key rewrites only the chosen format's fingerprint

Local acceptance script (needs the Android SDK and `bundletool`; not in CI):

1. `apksigner verify --min-sdk-version 24` passes on a Creator-signed APK,
   with a key from Create Key and with one from Upload Key
2. the signed APK installs on an API 24 emulator, a current-API emulator, and
   a physical device, and a higher Build Number signed with the same key
   installs over it with saves intact
3. a key backed up on one host and added with Upload Key on another produces
   an APK that updates the first host's install; the backup opens with
   `keytool -list`, and keystores made by `keytool` from an older and a
   current JDK, and by Android Studio, can be uploaded
4. `jarsigner -verify` and `bundletool validate` pass on a Creator-signed AAB
5. `bundletool build-apks` followed by `install-apks` runs the game, including
   a game package larger than the base module limit, read from the asset pack
   split
6. each check runs for exports from Creator desktop, Android, and iOS

### Phase 1 Steps And Gates

**1a. Spikes.**

- sign a hand-built APK with a from-scratch v2 implementation and install it
- build a bundle by hand with the game package in an install-time asset pack
  and confirm the player, changed to read through the asset's file descriptor,
  opens it from the split APK that Play (or `bundletool`) produces

Gate: both work on API 24 and on a current device. If the asset pack spike
fails, the player needs a different package reader for bundles before 1c
starts.

The APK signing spike ran on November 12, 2026. A v2 signer written in Rust
with the `rsa`, `x509-cert`, and `sha2` crates signed exported APKs that
`apksigner verify` accepts, on a desktop and on an Android tablet. On
Android 16 and Android 9, a signed build installed, a higher Build Number
signed with the same key installed over it with saves intact, one signed with
another key was refused, and a modified signed APK was refused. Still open:
API 24 and the asset pack spike.

**1b. APK signing.** Key store, Create Key, Upload Key, backup, replacement,
v2 signing, and the Versions and Platform Details UI on desktop.

Gate: acceptance steps 1 through 3 pass on desktop.

**1c. AAB export.** Player package reader change and APK template rebuild,
bundle template with the asset pack module, protobuf rewriting, JAR signing.

Gate: acceptance steps 2, 4, and 5 pass, and a bundle uploads to a Play
Console internal testing track and installs from it.

**1d. Mobile hosts.** Key store and bindings on the Android and iOS Creator.

Gate: acceptance step 6 passes, including the large-project export staying
within memory and reporting progress while it signs.

## Phase 2: Managed Cloud Key

APK only. The creator signs in to a RouteVN account and chooses **RouteVN
managed key** as the signing option. The key is created and held by a RouteVN
service, so it survives a lost or reset device and works on every device the
creator signs in on.

### Split Of Work

| Step                               | Where   |
| ---------------------------------- | ------- |
| Build the unsigned APK             | Device  |
| Digest the APK                     | Device  |
| Hold the private key and sign      | Service |
| Insert the signature and verify it | Device  |

The game never leaves the device. The device sends only the small v2 signed
data (a digest and the certificate), and the service returns a signature. A
multi-gigabyte game uploads a few kilobytes.

### What The Client Needs From The Service

The client requires an authenticated API that can:

- create a signing key for an application ID under the signed-in account and
  return its certificate; creating a key for an application ID that already
  has one returns the existing certificate
- return the certificate for an application ID
- sign a v2 signed-data block for an application ID and return the signature
- let the account owner download the key as a password-protected PKCS #12
  file
- delete a key after explicit confirmation

Contract points:

- the private key leaves the service only through the explicit download
- a creator can always download their key; RouteVN must not be the only
  holder, so a creator can leave or keep publishing if the service is
  unavailable
- the service signs only a well-formed v2 signed-data block whose certificate
  is the key's own, so the key cannot be used to sign anything else
- the service sees only a digest, so anyone holding the account's session
  could sign an update that installs over players' copies; the service keeps a
  log of signatures that the owner can review, and downloading or deleting a
  key requires a recent sign-in
- the recorded APK fingerprint in `androidSigning` works the same way as in
  Phase 1, so local and managed keys cannot be mixed up for one game
- signing with a managed key needs a network connection; local keys keep
  working offline
- a creator can move a Phase 1 local key into the service by sending a backup
  of it, so a game that already shipped keeps its identity; this is a separate
  action from Upload Key, which keeps the key on the device

### UI

- a third way to get a key, **RouteVN Managed Key**, next to Create Key and
  Upload Key; shown when signed in, and shown disabled with a sign-in prompt
  otherwise
- Platform Details shows whether the game's key is local or managed, with
  Download Key for managed keys
- sign-in, network, and service errors use stable categories with
  `withErrorDetails(...)` for unexpected failures

### Testing

- unit tests against a mock signing API: success, sign-in required, network
  failure, and a returned signature that does not verify
- the client verifies every returned signature against the certificate before
  writing the APK, so a wrong or tampered response never produces a file
- an APK signed through the service installs as an update over an APK signed
  with the same key after it is downloaded and added locally with Upload Key

## Out Of Scope

- collaboration: signing keys and recorded fingerprints are not shared with
  collaborators; a collaborator who exports a signed build on their own device
  uses a key of their own unless the creator gives them a backup
- a separate debug or test build
- managed cloud keys for AAB
- uploading to Google Play from Creator; the creator uploads in Play Console
- APK Signature Scheme v3 and key rotation
- supplying a creator's own app signing key to Play App Signing, which would
  make Play and self-distributed installs share a signature
- splitting a game package across several asset packs
- on-demand and fast-follow asset packs
- legacy JKS keystores written before JDK 9
- the web Creator as an export host

## Open Decisions

1. **Key protection at rest.** Recommended: store local keys with the
   platform's secure storage (Keychain on macOS and iOS, the Android Keystore
   to wrap the key file on Android, the OS credential store on Windows and
   Linux where available). Alternative: a plain file in the application data
   folder with owner-only permissions, which is simpler and matches how most
   Android tooling keeps keystores. A key file wrapped with the Android
   Keystore cannot be decrypted on another device, which is another reason
   keys stay out of device transfer.
2. **Package placement in bundles.** Recommended: always put the game package
   in an install-time asset pack, so small and large games share one code
   path. Alternative: keep it in the base module when it fits and use an
   asset pack only above the limit. Decided by the Phase 1a spike.
3. **One key or two per game.** Recommended: one key for both APK and AAB by
   default, which is simpler to explain and back up; the separate recorded
   fingerprints still allow two keys when a creator needs them. Alternative:
   generate a separate upload key for AAB by default, which is what Google
   recommends when a creator also supplies their own app signing key to Play.
4. **Default format.** Recommended: APK, because it works without a store
   account. Alternative: ask every time with no default.
5. **Legacy JKS upload.** Recommended: not in the first release; the Upload
   Key error explains how to convert with `keytool -importkeystore`. Alternative:
   implement the JKS format in the exporter.
6. **Device backups of keys on iOS.** Android already excludes all Creator
   app data from cloud backup, and keys stay out of device transfer. On iOS,
   recommended: exclude signing keys from iCloud device backup and rely on the
   explicit backup file, so a private key never reaches a cloud the creator
   did not choose. Alternative: include them so a restored iPhone keeps its
   keys.
7. **Phase 2 alternative.** An encrypted cloud backup of the local key, where
   the device still signs and the service stores only ciphertext, gives the
   same recovery with less custody. Recommended: revisit before starting
   Phase 2, based on how often creators lose local keys.
