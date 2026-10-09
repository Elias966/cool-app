# Prism

Modular Electron app (AppImage) with a three.js background; each page is a
module in `src/modules/<id>/`. **Read `HANDOFF.md` first**: it covers the
architecture, every module, packaging fixes, gotchas and open items.

- Node is project-local: `export PATH="$PWD/.tools/node/bin:$PATH"`
- `npm start` runs the app; `npm run dist` builds `dist/Prism-<version>-x86_64.AppImage`
- Module contract: `module.json` + `export default { mount(root, ctx) }` returning a cleanup
- Prefix each module's CSS classes; use `backwards` fill for entrance animations
- When testing the app, use a temporary user-data dir so the user's history isn't touched
- AI model is set only in `src/modules/braille/ai-modes.js` (`AI_SPEC`; the Android app uses a smaller one)
- Releases: bump `version` in `package.json` and add `release-notes/<version>.md`;
  pushing it makes `.github/workflows/release.yml` build the AppImage and the APK and publish release `v<version>`
- Android app: `android version/` runs the same `src/` in a WebView (`npm run android`); module layouts
  must also work on phones (see "Android app" in HANDOFF.md), test with phone/tablet emulation
