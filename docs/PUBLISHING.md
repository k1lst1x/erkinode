# Website and desktop releases

GitHub Pages hosts the download website and documentation. GitHub Releases hosts desktop installers. These are separate workflows; pushing source alone does not produce installers.

## First publication in GitHub Desktop

1. Publish this repository publicly in GitHub Desktop, then push `main`.
2. On GitHub, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Create a GitHub Actions environment named **release** under **Settings → Environments**. Restrict deployment branches/tags to `main` and `v*`; add required approval when the repository plan and maintainer setup permit it.
4. Create an active tag ruleset under **Settings → Rules → Rulesets** for `v*`. Restrict tag creation, updates, and deletion to the release maintainer.
5. Open **Actions → Deploy website → Run workflow** if the initial push happened before Pages was enabled. Later main-branch pushes deploy automatically.
6. The workflow's deployment summary shows the site's exact URL, normally `https://OWNER.github.io/REPOSITORY/`. Documentation is under `/REPOSITORY/docs/`.
7. Open **Actions → Publish desktop release → Run workflow** on `main` to build and publish the version in `package.json`.

The workflow gets the actual repository name from `GITHUB_REPOSITORY`; forks and renamed repositories do not need hard-coded website links. A custom domain can be configured separately in GitHub Pages settings. No domain is assumed.

## Release process

The release workflow runs on manual dispatch or a pushed `v*` version tag. A tag must exactly match `v` plus the checked-out package version. Before packaging, the workflow verifies that the release commit belongs to `origin/main`. The publication job uses the protected `release` environment. For a manual run, the publisher creates the tag at the workflow's checked-out commit if it does not already exist.

Four native runners produce:

| Target      | Runner         | Files       |
| ----------- | -------------- | ----------- |
| macOS arm64 | macos-15       | DMG and ZIP |
| macOS x64   | macos-15-intel | DMG and ZIP |
| Windows x64 | windows-latest | Setup.exe and portable .exe |
| Linux x64   | ubuntu-24.04   | AppImage    |

Each job checks native PTY readiness, runs source checks/tests, and packages without automatic electron-builder publication. A separate job validates all seven expected files, writes SHA-256 checksums, creates GitHub build-provenance attestations for the installers and checksum manifest, creates or resumes a draft release, uploads the complete asset set, then publishes it. A failed matrix job prevents publication. Existing published releases are not overwritten: increment the version for a replacement. Every external GitHub Action is pinned to an immutable full commit SHA; the adjacent version comment records the reviewed upstream release.

### Free release verification

GitHub Artifact Attestations are enabled with the workflow's short-lived OIDC identity; no project signing key is stored for them. Public-repository users can verify a downloaded artifact with `gh attestation verify FILE --repo OWNER/REPOSITORY`.

Versions with a prerelease suffix publish as GitHub prereleases. The website supports beta assets even before the first stable release; it prefers a stable release once one exists. It never assumes `/releases/latest` includes prereleases.

Use a unique `package.json` version and increment `build.buildVersion` for distributed application updates. Commit and push first. Do not change a published release's binaries in place.

## Website behavior

The static site is generated to `_site/` by `pnpm site:build`. The desktop renderer's `dist/` is separate and is never uploaded as the website. Documentation is rendered from tracked Markdown with working relative links and an article navigation/filter.

The home page detects OS locally from browser platform data. When available, User-Agent Client Hints can identify architecture. Safari commonly does not expose Mac architecture reliably, so the site asks for Apple Silicon or Intel instead of guessing. Mobile/ChromeOS visitors receive a desktop-download explanation. All supported target choices remain visible.

The browser fetches public GitHub Release metadata and only enables links for actual uploaded assets with the expected names and repository URL. Missing builds have a clear status. A failed/rate-limited API request falls back to the repository's Releases page. No API token, analytics, remote font, advertising, or tracking SDK is embedded.

## Local preview and checks

```sh
pnpm install --frozen-lockfile --ignore-scripts
SITE_REPOSITORY=OWNER/REPOSITORY pnpm site:build
pnpm site:preview
pnpm site:check
pnpm site:test
```

`SITE_REPOSITORY` is optional for a local-only preview. Without it (and without a remote or GitHub Actions environment), release links stay unconfigured rather than pointing to an invented repository. In CI the actual repository is supplied automatically.

The browser test uses mocked public release responses to cover OS detection, missing assets, beta downloads, API failure, documentation links, nested project paths, mobile layout, and screenshots. It does not claim remote deployment or completed Windows/Linux desktop QA.

## Current release limitations

Platform signing/notarization and automatic in-app updates are not implemented. SHA-256 and GitHub attestations improve integrity and provenance but do not replace Windows Authenticode or Apple Developer ID/notarization. The website describes beta status and the difference between available build artifacts and tested desktop support. Publishing artifacts is not evidence of complete Windows, Linux, or Intel Mac GUI validation.

References: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [GitHub Releases API](https://docs.github.com/en/rest/releases/releases), [runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
