# iOS App Store Release Automation

Reviewed: 2026-09-06. Reference only; publishing is not implemented in this repo.

Apple's [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
supports binary uploads, TestFlight, metadata updates, review submission, and
release of approved versions.

## Official References

| Task                             | Apple documentation                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API access and authentication    | [Create API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api), [generate JWTs](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests)                                      |
| Build and sign an IPA            | [Distribution workflow](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)                                                                                                                                                       |
| Upload binaries                  | [Build Upload REST API](https://developer.apple.com/documentation/appstoreconnectapi/build-uploads), [Xcode and Transporter options](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)                                                              |
| Manage TestFlight builds         | [Builds API](https://developer.apple.com/documentation/appstoreconnectapi/builds)                                                                                                                                                                                                  |
| Update versions and store assets | [App Store Versions](https://developer.apple.com/documentation/appstoreconnectapi/app-store-versions), [asset uploads](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect)                                                         |
| Submit for review                | [Review submissions](https://developer.apple.com/documentation/appstoreconnectapi/review-submissions), [submission items](https://developer.apple.com/documentation/appstoreconnectapi/review-submission-items)                                                                    |
| Release an approved version      | [Release requests](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-release-requests), [automatic or scheduled release](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option) |
| Use Apple-hosted CI              | [Xcode Cloud workflows](https://developer.apple.com/documentation/xcode/xcode-cloud-workflow-reference)                                                                                                                                                                            |

The release flow is: build/sign → upload → await processing → test → submit for
App Review → release after approval. Uploading does not bypass review.

API authentication and app signing require separate credentials. Store private
keys in CI secrets; the linked setup guides describe roles and token requirements.

## Repository Next Step

The [current iOS helper](../../scripts/ios.sh) builds unsigned Simulator apps.
Add distribution signing and archive/export support, then a macOS CI job using
`xcodebuild`, Transporter, and the REST API. See [iOS development](../ios.md).
