# Erkinode identity

**Erkinode** · `erkinode`

**Your servers. Your freedom.**

Name: Kazakh _erkin_ (free, unconstrained) + English _node_ (network node). This is a coined brand name, not an existing Kazakh compound word. The ASCII spelling `Erkinode` stays unchanged. The project's naming direction follows the maintainer's preference for Kazakh roots.

## Mark

The mark combines an open E with three connection endpoints. The outer route joins two nodes; the open middle node suggests another connection and a terminal workspace. The shape stays open on the right: the client gives access rather than placing a lock or a paywall in front of the user.

The logo is original SVG geometry authored for this repository. It does not reuse the former anchor, Termius marks, stock clip art or generated raster artwork.

| Asset                         | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `erkinode-symbol.svg`         | mint symbol, transparent background |
| `erkinode-wordmark-dark.svg`  | README and dark surfaces            |
| `erkinode-wordmark-light.svg` | light surfaces                      |
| `../build/icon.svg`           | macOS/Windows/Linux app-icon source |
| `../src/BrandMark.tsx`        | application sidebar mark            |

Primary mint: `#A5E8CC`. Dark: `#111B18`. Light: `#F0F5F1`. On light surfaces use green `#236448` rather than the low-contrast mint. Keep one node's diameter as clear space around the symbol. Do not place the full tagline inside small app icons.

Typography uses the platform system UI font in the app and Helvetica/Arial fallbacks in portable wordmark SVGs. No external webfont is loaded. Logo sources are included under the repository’s MIT OR Apache-2.0 dual license (at your option); this guide does not add restrictions to source-code or artwork reuse. Describe modified builds accurately and do not present them as the original maintainer's release.

Regenerate packaged PNG/ICNS on macOS with `node scripts/make-icon.mjs`. The PNG and ICNS are committed so other platforms do not require macOS iconutil to build.

No trademark registration, domain registration or package-name reservation is claimed.
