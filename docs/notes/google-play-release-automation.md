# Google Play Release Automation

Researched: 2026-09-06. Scope: publishing RouteVN Creator's Android app and
updates through Google Play. This is research and a proposed workflow; no
Google Cloud configuration, authenticated upload, or release was performed.

## Finding

Yes. The Google Play Developer API, also called the Android Publisher API,
supports uploading Android App Bundles, updating store listings, assigning
builds to testing and production tracks, and managing staged rollouts. The
service is `androidpublisher.googleapis.com`, using the v3 REST API. See the
[API reference](https://developers.google.com/android-publisher/api-ref/rest).

Google Cloud provides API enablement and service-account identity. Google Play
Console grants that identity permission to manage the app. Enabling the API or
granting Cloud IAM roles alone does not establish Play Console access. Google
also says that the old requirement to link the developer account to a Cloud
project no longer applies. See
[Getting Started](https://developers.google.com/android-publisher/getting_started).

This complements the [iOS automation research](./ios-app-store-release-automation.md).
The existing [Android Google Play Updates documentation](../android.md#google-play-updates)
describes the installed app's update flow; this document covers the publisher's
upload and release pipeline.

## Publishing API and Reporting API

These are separate services in Google Cloud's API Library:

| API                                                       | Service name                            | Purpose                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Google Play Android Developer API (Android Publisher API) | `androidpublisher.googleapis.com`       | Upload builds, manage store listings, testing tracks, and production releases.                                           |
| Google Play Developer Reporting API                       | `playdeveloperreporting.googleapis.com` | Read Android vitals such as crash rates, application-not-responding (ANR) rates, performance metrics, and error reports. |

See the [Publisher API reference](https://developers.google.com/android-publisher/api-ref/rest),
[Reporting API overview](https://developers.google.com/play/developer/reporting),
and [Reporting API reference](https://developers.google.com/play/developer/reporting/reference/rest).

The publishing pipeline needs the Publisher API. Enable Reporting separately
if we want automated quality monitoring after a release. Both can use the same
Cloud project; grant the reporting identity the Play Console permissions needed
for its metric sets. See
[Reporting API setup](https://developers.google.com/play/developer/reporting/overview).

Reporting requests use their own OAuth scope:

```text
https://www.googleapis.com/auth/playdeveloperreporting
```

The [Reporting apps.search method](https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/apps/search)
documents this scope. Request the appropriate scope for each service; enabling
one API does not enable the other. The release-lifecycle status endpoint used
later in this document belongs to the Publisher API, so checking publication
status does not require the Reporting API.

## Google Cloud and Play Console Setup

1. Create or select a Google Cloud project.
2. Enable the **Google Play Android Developer API** / **Google Play Developer
   API** for that project, service `androidpublisher.googleapis.com`.
3. Create a service account for release automation.
4. In Play Console → Users and permissions, invite the service account's email
   address and grant access to the intended app.
5. Configure CI authentication as that service account. Google recommends
   service accounts for server-to-server Play API access; an OAuth client is
   another option when acting on behalf of an individual user. See
   [Google's setup instructions](https://developers.google.com/android-publisher/getting_started).

Select Play permissions for the actual job: app visibility, releases to testing
tracks, releases to production, and store-presence management if updating
listings. Restrict app access to `com.routevn.creator` where appropriate. Billing
permissions are not the release-publishing permissions; do not copy the billing
example in the getting-started guide as a publishing role template. See
[Play Console permission definitions](https://support.google.com/googleplay/android-developer/answer/9844686).

Requests use OAuth 2.0 bearer access tokens with this scope:

```text
https://www.googleapis.com/auth/androidpublisher
```

A plain Google Cloud API key is not sufficient. The API requires OAuth
authorization; see [Authorization](https://developers.google.com/android-publisher/authorization).
Use an authentication library to obtain and renew tokens.

For CI, prefer Workload Identity Federation with service-account impersonation
when supported by the runner, so the job can obtain short-lived credentials.
This is a proposed authentication design, not a tested integration in this
repo. The impersonated service account must still have Play Console access and
the access token must include the publishing scope. Google's
[pipeline federation guide](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
documents the CI identity setup. A service-account JSON key stored in CI secrets
is an alternative; keep it out of source, generated web assets, and the app.

## What Can Be Automated

| Operation                                | API resource                              | Result                                                                                 |
| ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Upload a signed `.aab`                   | `edits.bundles.upload`                    | Returns the uploaded bundle, including its version code.                               |
| Upload supported APK artifacts           | `edits.apks.upload`                       | Available for applicable distribution workflows; this repo's Play release uses an AAB. |
| Update localized descriptions and images | `edits.listings`, `edits.images`          | Store changes grouped in an edit.                                                      |
| Release to testing or production         | `edits.tracks`                            | Assigns uploaded version codes and release notes to a track.                           |
| Stage, halt, resume, or complete rollout | Track release `status` and `userFraction` | Controls release availability to eligible users.                                       |
| Validate and commit changes              | `edits.validate`, `edits.commit`          | Checks and applies a prepared edit; review and publishing settings still apply.        |
| Inspect review/publication progress      | `applications.tracks.releases.list`       | Distinguishes draft, review, approval, rejection, and publication states.              |

See the [bundle upload reference](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload),
[Edits guide](https://developers.google.com/android-publisher/edits),
[track resource](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks),
and [release lifecycle resource](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases).

## Routine Release API Flow

The following is an endpoint map, not an executable release script. The normal
base URL is `https://androidpublisher.googleapis.com/androidpublisher/v3`.
`packageName` is the Android application ID, not the Google Cloud project ID.

1. Build and sign the AAB. API authentication and binary signing are separate:
   the service account authorizes publishing, while the upload key signs the
   bundle. With Play App Signing, Google uses the app signing key for delivered
   APKs. See [Sign your app](https://developer.android.com/studio/publish/app-signing).
2. Create an edit with
   `POST /applications/{packageName}/edits`. Retain the returned edit ID. See
   [edits.insert](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/insert).
3. Upload the AAB to the media-upload endpoint:
   `POST https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{packageName}/edits/{editId}/bundles`.
   Use the returned `versionCode` for subsequent track assignments. See
   [edits.bundles.upload](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload).
4. Read the available tracks and update the intended track using
   `PUT /applications/{packageName}/edits/{editId}/tracks/{track}`. Supply its
   releases, version codes, release notes, and desired rollout status. Discover
   track IDs from the API rather than assuming a Console display label is its
   API ID. Preserve any version codes that should remain available. See
   [track resources](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks)
   and [edits.tracks.update](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks/update).
5. Apply any desired localized listing and image changes within the same edit.
   See the [Edits workflow](https://developers.google.com/android-publisher/edits).
6. Validate with `POST /applications/{packageName}/edits/{editId}:validate`.
   Validation checks the edit; it is not Google Play review approval. See
   [edits.validate](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/validate).
7. Commit with `POST /applications/{packageName}/edits/{editId}:commit`, using
   the review behavior described below. See
   [edits.commit](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit).
8. Check the release lifecycle and verify the expected version is available on
   the intended track. See
   [release summaries](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases).

For a staged production update, use `status: "inProgress"` and a `userFraction`
between 0 and 1, such as `0.1` for 10%. Later edits can increase that fraction,
halt rollout, or set `status: "completed"` for a full release. Omit
`userFraction` for a completed release. Halting does not remove the update from
people who already installed it. See
[release status definitions](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks).

## Review and Publishing Behavior

**An upload or commit is not proof of public availability.** The release
lifecycle API reports states including `IN_REVIEW`, `NOT_APPROVED`,
`APPROVED_NOT_PUBLISHED`, and `PUBLISHED` with the
`RELEASE_LIFECYCLE_STATE_` prefix. Use these states to distinguish an accepted API
request from a published release. A published staged or halted release can also
report `PUBLISHED`; inspect the track configuration to determine rollout scope.
See [ReleaseLifecycleState](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases#ReleaseLifecycleState).

With Managed publishing off, approved changes normally publish automatically.
With it on, covered changes wait for a separate publish action in Play Console.
Google documents exceptions, including increasing an existing staged rollout
to 100%. For a pipeline that should run unattended after approval, configure
the publishing mode accordingly. See
[Control when app changes are reviewed and published](https://support.google.com/googleplay/android-developer/answer/9859654).

Two current `edits.commit` options matter:

- Recommend `changesInReviewBehavior=ERROR_IF_IN_REVIEW` for the initial
  implementation. The documented default, `CANCEL_IN_REVIEW_AND_SUBMIT`, can
  cancel an existing review and submit the combined changes again.
- `changesNotSentForReview` can leave changes awaiting explicit submission from
  Play Console, including rejection-recovery workflows. If using it, record
  that manual submission remains necessary; do not report the release as sent
  for review.

These parameters are documented in
[edits.commit](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit).

## Initial Setup and Operational Limits

- Bootstrap the app and its first artifact through Play Console, including
  required publishing declarations. Google's Edits guide describes updates to
  an existing app with a prior Console upload and excludes required legal
  consents. Its overview still uses APK terminology; current new-app release
  guidance uses Android App Bundles. See
  [Edits prerequisites](https://developers.google.com/android-publisher/edits)
  and [Prepare and roll out a release](https://support.google.com/googleplay/android-developer/answer/9859348).
- Account-specific testing and production-access requirements still apply.
  API access does not establish production eligibility. See
  [testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465).
- Serialize publishing jobs per app. Concurrent Console changes or another
  committed edit can invalidate the current edit. Re-read current state before
  rebuilding an invalid edit. See
  [edit concurrency rules](https://developers.google.com/android-publisher/edits).
- Keep the package name and signing identity consistent, and increment Android
  `versionCode` for a new uploaded build. Verify availability through a Play
  installation; the app's existing in-app update flow remains subject to Play
  eligibility. See [Android release and update setup](../android.md#google-play-updates).

## Proposed Path for This Repository

Already present:

- [`bun run android:bundle`](../../package.json) builds packaged frontend assets
  and runs Gradle `bundleRelease` with
  `-ProutevnDistribution=google-play`.
- [Gradle configuration](../../android/routevn/app/build.gradle.kts) reads
  `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
  optional `ANDROID_KEY_PASSWORD` for signing. It can produce an unsigned
  release artifact when those inputs are absent, so the publishing job should
  explicitly require signing credentials.
- [Android docs](../android.md#release-signing) describe signing, while
  [Google Play Updates](../android.md#google-play-updates) documents physical-device
  update validation through Internal App Sharing.

No Android Publisher API client or Play publishing CI job was found in the
current scripts/workflows. Google account configuration and package ownership
were not verified.

Recommendation: add a Linux CI job using the existing Bun/Gradle build, followed
by a small publishing script using Google's API and an OAuth authentication
library. Google recommends its client libraries in the
[REST reference](https://developers.google.com/android-publisher/api-ref/rest).
The CI runner can be hosted outside Google Cloud; the Cloud project supplies
identity and API configuration, not a requirement to move the build there.

Suggested sequence:

1. Complete Play Console bootstrap, signing setup, and API/service-account
   permissions.
2. Automate a signed AAB upload to an internal testing track and verify delivery.
3. Add explicit version-code inputs, release notes, and lifecycle reporting.
4. Promote the tested version code to production through a new edit, starting
   with a staged rollout if desired.
5. Automate later rollout expansion or halt decisions according to the release
   policy, with Managed publishing and in-review behavior configured explicitly.

This work would automate publishing the Android app. The current in-app update
adapter would continue handling download and restart on eligible installations.
