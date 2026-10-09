# Mobile (Android) test scripts

Playwright scripts used to build the Android version. They serve `src/` live
(plus the generated `index.html`, `modules.json` and `android/` from
`android version/app/src/main/assets/www`, so run `npm run android:web` once
first) with a fake `window.AndroidBridge`, in Chromium with phone/tablet
emulation. They `require('playwright')` from `/opt/node-tools/node_modules/` and
launch `/opt/pw-browsers/chromium` (the Claude Code cloud container); elsewhere
set `PW_MODULES` (a folder whose `node_modules` has playwright, with a trailing
slash) and `CHROMIUM` (any Chromium-based browser, e.g.
`/opt/brave.com/brave/brave`).

- `mobile-test.mjs [devices] [modules]`: screenshots into `out/` plus a report of
  elements overflowing the screen and buttons under 32px. Devices: `phone` 393x852,
  `small` 360x640, `landscape` 852x393, `tablet` 800x1280, `tabletLand` 1280x800.
  Example: `node tests/mobile/mobile-test.mjs phone,landscape,tablet cipher`
- `feature-test.mjs`: Android behaviour: back button, native clipboard, haptics,
  sound menu, Cipher key-card share.
- `ai-int.mjs`: real local-AI run on an emulated phone (downloads the ~520 MB
  model into `ai-profile/` the first time).
- `phone-sound.mjs`: renders every sound preset through the desktop and the
  phone mixing chain and compares how much is audible above 250 Hz.
- `LAYOUT-BRIEF.md`: the rules and breakpoints for making a module's layout work
  on phones (given to the helpers that did the module layouts).
