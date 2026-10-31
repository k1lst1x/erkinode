# Versioning and release channels

Erkinode uses SemVer-shaped application versions: `MAJOR.MINOR.PATCH`, with an explicit prerelease suffix for test builds. This is our release policy; it does not imply that the desktop app exposes a stable public programming API.

The current release is **1.0.0**.

| Example        | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `1.0.0`        | First release meeting documented stability and support commitments |

Use a `v`-prefixed Git release tag matching the package version, such as `v1.0.0`, and use the same package version for artifact names. Do not create a new product version for every local rebuild. The UI and test expectations read `package.json`; do not hard-code independent version labels.

`build.buildVersion` is the numeric OS bundle build identifier, currently `2`. Increment it for distributed rebuilds as needed; it is separate from the user-facing SemVer version. Persisted vault and backup schema versions remain independently versioned and must not change for cosmetic or language updates.

Application code is shared across platforms, but every advertised OS/architecture requires its own artifact and QA. Beta status is not a substitute for signing, notarization, OS credential-store tests, or recovery checks.

Reference: [Semantic Versioning 2.0.0](https://semver.org/).
