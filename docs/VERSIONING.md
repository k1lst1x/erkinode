# Versioning and release channels

Erkinode uses SemVer-shaped application versions: `MAJOR.MINOR.PATCH`, with an explicit prerelease suffix for test builds. This is our release policy; it does not imply that the desktop app exposes a stable public programming API.

The current release is **0.1.0-beta.2**. Version zero indicates active initial development, and the prerelease suffix keeps the beta status visible in filenames, About, and the interface.

| Example        | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `0.1.0-beta.1` | First beta of the initial public release                           |
| `0.1.0-beta.2` | macOS packaging integrity fix for unsigned beta distribution       |
| `0.1.0`        | Release after the beta gates are satisfied                         |
| `0.1.1`        | Compatible fixes to the released 0.1 line                          |
| `0.2.0-beta.1` | Beta of the next feature set                                       |
| `1.0.0`        | First release meeting documented stability and support commitments |

Use a `v`-prefixed Git release tag matching the package version, such as `v0.1.0-beta.2`, and use the same package version for artifact names. Do not create a new product version for every local rebuild. The UI and test expectations read `package.json`; do not hard-code independent version labels.

`build.buildVersion` is the numeric OS bundle build identifier, currently `2`. Increment it for distributed rebuilds as needed; it is separate from the user-facing SemVer version. Persisted vault and backup schema versions remain independently versioned and must not change for cosmetic or language updates.

Application code is shared across platforms, but every advertised OS/architecture requires its own artifact and QA. Beta status is not a substitute for signing, notarization, OS credential-store tests, or recovery checks.

Reference: [Semantic Versioning 2.0.0](https://semver.org/).
