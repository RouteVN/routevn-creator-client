# Google Play Release Automation

Reviewed: 2026-09-06. Reference only; publishing is not implemented in this repo.

## Publishing API and Reporting API

These are separate services enabled in Google Cloud:

| API                                                                                                          | Service                                 | Purpose                                                                     |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------- |
| [Google Play Android Developer API](https://developers.google.com/android-publisher/api-ref/rest)            | `androidpublisher.googleapis.com`       | Upload builds, update listings, and manage testing/production releases.     |
| [Google Play Developer Reporting API](https://developers.google.com/play/developer/reporting/reference/rest) | `playdeveloperreporting.googleapis.com` | Read Android vitals: crashes, ANRs, performance metrics, and error reports. |

Publishing requires the first API. Reporting is optional for quality monitoring.

## Setup

Enable the API in a Google Cloud project, create a service account, and grant
it app access in Play Console → Users and permissions. Cloud IAM access alone
does not grant Play access. Follow Google's
[Publisher setup](https://developers.google.com/android-publisher/getting_started)
and [Reporting setup](https://developers.google.com/play/developer/reporting/overview).

Use OAuth access tokens with the appropriate scope:

- Publisher: `https://www.googleapis.com/auth/androidpublisher`
- Reporting: `https://www.googleapis.com/auth/playdeveloperreporting`

See [Publisher authorization](https://developers.google.com/android-publisher/authorization)
and [Reporting authorization scope](https://developers.google.com/play/developer/reporting/reference/rest/v1beta1/apps/search).
Keep private credentials in CI secrets.

## Release API References

| Step                                    | Google documentation                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create an edit                          | [edits.insert](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/insert)                                                                                                   |
| Upload a signed AAB                     | [edits.bundles.upload](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload)                                                                                   |
| Assign a release and rollout percentage | [edits.tracks](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks)                                                                                                   |
| Update localized listings and images    | [Edits workflow](https://developers.google.com/android-publisher/edits)                                                                                                                        |
| Validate and commit                     | [edits.validate](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/validate), [edits.commit](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit) |
| Check review/publication status         | [Release lifecycle API](https://developers.google.com/android-publisher/api-ref/rest/v3/applications.tracks.releases)                                                                          |

Bootstrap the app through Play Console before using the
[Edits API](https://developers.google.com/android-publisher/edits).
Google review still applies; [Managed publishing](https://support.google.com/googleplay/android-developer/answer/9859654)
can hold approved changes for a separate publish action.

For CI, prefer `changesInReviewBehavior=ERROR_IF_IN_REVIEW` when committing:
the documented default can cancel an existing review. See
[commit options](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit).

## Repository Next Step

[`bun run android:bundle`](../../package.json) already builds an AAB with optional
[release signing](../android.md#release-signing). Add a publishing CI job that
requires signing, uploads to a testing track, and promotes the tested version
to production. [In-app updates](../android.md#google-play-updates) are already
documented separately.
