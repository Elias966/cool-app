# Prism: handoff

State as of 2026-10-09. Read this before changing anything; `README.md` is the
user-facing description, this file is for whoever works on the code next.

## What it is

**Prism** is a modular Electron desktop app, shipped as a Linux AppImage. A
three.js 3D background plus a shell (dock, home launcher, page transitions)
hosts **modules**: self-contained pages discovered at startup. Six modules
exist, each translating text both ways with heavy visual effects.

- Project: `/home/theking/cool-app` (not a git repo yet)
- Build output: `dist/Prism-1.0.0-x86_64.AppImage` (~138 MB)
- Target: Ubuntu-family (the user's machine is Zorin OS / GNOME on X11) and Arch

## Run and build

Node is installed only inside the project (`.tools/node`, v24); there is no
system Node.

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
npm start        # dev run (runs scripts/vendor.js first)
npm run dist     # build the AppImage (also runs scripts/vendor.js first)
```

- `scripts/vendor.js` copies the parts of three.js the renderer imports into
  `src/vendor/three/` (git-ignored). Needed because electron-builder silently
  drops any `examples/` folder inside `node_modules`.
- Electron 44.7, electron-builder 26.15, three 0.186, @huggingface/transformers 4.3.1.
- DevTools: F12 or Ctrl+Shift+I. Ctrl+R reloads. Esc returns home.

## Architecture

```
electron/main.js       window (frameless), app://prism protocol, module discovery,
                       AI utility process bridge, AppImage desktop integration
electron/preload.js    window.prism: listModules, openModulesFolder, ai.*, win.*
electron/ai-host.mjs   utility process: downloads + runs ONNX models (transformers.js)
src/index.html         shell markup + import map for three
src/core/app.js        router, dock, transitions, builds the ctx handed to modules
src/core/scene.js      three.js background (stars, wireframe core, grid, bloom)
src/core/fx.js         tilt, magnetic, ripple, scramble, burst (particle canvas)
src/core/ai.js         ctx.ai (load / generate / status), cancels jobs on unmount
src/core/home.js       launcher page
src/modules/<id>/      one folder per module
build/after-pack.js    wraps the binary to add --no-sandbox inside AppImages
build/icon.png         app icon (generated with Python, 512 px)
```

- Everything is served from one origin, `app://prism/`: `/…` → `src/`,
  `/user/…` → `~/.config/Prism/modules/` (user-installed modules, no rebuild).
- **Module contract:** a folder with `module.json` (`id`, `name`,
  `description`, `icon`, `accent`, `entry`, `style`, `order`) and an ES module
  whose default export is `{ mount(root, ctx) }`; `mount` returns a cleanup
  function. `ctx` = `{ meta, scene, fx, toast, ai, storage, navigate, url }`.
  `storage` is namespaced localStorage per module. Prefix module CSS classes
  (`br-`, `b64-`, `dg-`, `an-`, `es-`, `ly-`).
- Each module follows the same page pattern: canvas intro effect, header,
  live preview, history feed of cards (saved in `ctx.storage`, max ~40), a
  console with textarea + send button, a mode switch, and a Clear button that
  wipes the history (in the header for Braille, in the console bar elsewhere).

## Modules

| Module | Folder | Modes | Core logic |
|---|---|---|---|
| Text to Braille | `braille/` | Text→Braille, Braille→Text, Braille Quest (AI), Braille Anywhere (AI) | `braille.js` (UEB Grade 1), `ai-modes.js` |
| Text to Base64 | `base64/` | encode, decode | `base64.js` |
| Text to Dingbats | `dingbats/` | encode, decode (font auto-detect) | `dingbats.js`, `maps.js` |
| Ancient Scripts | `ancient/` | encode, decode (mixed scripts) | `scripts.js` |
| Esoteric Languages | `esolang/` | text→program, program→text (runs it) | `esolangs.js` |
| Layered Encoding | `layers/` | text→layers, layers→text (Auto-peel or My chain) | `layers.js` |

Notes per module:

- **Braille:** UEB Grade 1 only (no contractions). Perkins keypad chords use
  physical key codes (F D S J K L), so any keyboard layout works.
- **Braille AI modes:** the user went through many iterations and then asked
  to return to the **first version** of both modes while keeping the large
  model. Current state = original prompts (16 Quest formats, 18 Anywhere
  formats, each pre-filling an opening line containing the placeholder word
  "Glyph"; the model never sees the user's text; "Glyph" is swapped for
  braille afterwards; one generation of ≤120 tokens). Model:
  `onnx-community/Qwen2.5-1.5B-Instruct`, dtype `q4f16` (1.2 GB, ~8.6 tok/s on
  CPU, ~5 s load). Change the model only via `AI_SPEC` in
  `braille/ai-modes.js`; the UI label is derived from it (`AI_LABEL`).
- **Base64:** decoder accepts URL-safe, missing padding, whitespace, `data:` URIs;
  binary results shown as hex.
- **Dingbats:** maps generated from Wikipedia's Unicode mapping tables
  (Zapf follows Apple's DINGBATS.TXT). No font maps two keys to one symbol, so
  decoding is exact. Bundles Noto Sans Symbols / Symbols 2 / Math (OFL, license
  in `fonts/OFL.txt`).
- **Ancient:** 6 scripts (Elder Futhark, Egyptian hieroglyphs, Ogham, Ugaritic
  cuneiform, Ancient Greek, Latin). Every code point was checked against
  Python's `unicodedata`. Decoding picks the most common English letter for
  shared signs (`PREFER` in `scripts.js`), so it reads well but isn't always
  the exact original spelling. Bundles 5 Noto fonts (OFL).
- **Esolang:** generators + step-by-step interpreters for Brainfuck, Ook!,
  Whitespace (full), Malbolge (reference semantics), Befunge-93 (full), Unary.
  Every generated program is verified by running it. The Malbolge interpreter
  was validated against the published "Hello, world." program. Malbolge
  generation is straight-line (no jumps) and can only reach 201 of 256 byte
  values, so non-ASCII text is reduced to ASCII with an on-screen note.
- **Layered Encoding:** encoding chains (a.k.a. String Compositions /
  Mixture-of-Encodings): up to 8 invertible layers stacked on one string, in
  any order. 13 layers: Base64, Base32, Ascii85, Hex, Binary, Percent, HTML
  entities, Unicode escapes, ROT13, ROT47, Atbash, Reverse, Fullwidth
  (Fullwidth swaps ASCII and wide forms both ways, so it is its own inverse).
  Chain built in the side panel (click tiles, drag or ↑↓ to reorder, presets,
  Shuffle = random order and depth). Decoding: *My chain* undoes the current
  chain exactly; *Auto-peel* is a beam search over decodings scored by
  `readability()` (format decodes earn a bonus, blind cipher steps cost, at
  most 4 ciphers in a row). Random chains of depth 1–5: 100% exact round trip,
  ~98.5% auto-peel; misses are inherently ambiguous (reversed CJK, 2–3 letter
  messages). Intermediate strings are capped at 400k chars (Binary is 9x per
  layer).

## Packaging details (each one fixed a real problem)

- `build.toolsets.appimage: "1.0.3"`: static AppImage runtime, so no
  `libfuse2`/`fuse2` is needed (works on Arch). Still needs `fusermount3` from
  FUSE 3, which desktop installs have.
- `build/after-pack.js`: AppImages can't ship a setuid sandbox helper, so the
  launcher adds `--no-sandbox` when running as an AppImage.
- `asarUnpack` for `onnxruntime-node`, `sharp`, `@img`; the CUDA/TensorRT
  libraries and other platforms' binaries are excluded via `build.files`.
- `main.js` `integrateDesktop()`: on AppImage launch it writes
  `~/.local/share/applications/prism.desktop` (`StartupWMClass=prism`) and the
  icon to `~/.local/share/icons/hicolor/512x512/apps/prism.png`. `Icon=` is an
  **absolute path** because the user's stale `icon-theme.cache` hid the icon
  (dock showed a gear).
- Portable mode: a folder named `Prism-1.0.0-x86_64.AppImage.config` next to
  the AppImage makes all data (models, history) live there.

## Where data lives

- `~/.config/Prism/`: app data, history (Local Storage), downloaded models in
  `models/`. The AI model downloads automatically the first time an AI mode is
  opened (not at launch); it's already downloaded on the user's machine.
- `~/.config/Prism/models/HuggingFaceTB/SmolLM2-360M-Instruct` (350 MB) is the
  old, unused model. Offered to delete it; the user hasn't answered.

## Gotchas learned the hard way

- CSS entrance animations must use `backwards` fill, not `forwards`/`both`, or
  they lock `transform` and break hover tilt.
- three.js: set `scene.background` rather than `renderer.setClearColor` with the
  bloom/OutputPass composer (otherwise the background is sRGB-encoded twice and
  looks grey).
- Base64 live preview: don't use `direction: rtl` tricks; `=` padding jumps to
  the wrong end. It now trims the front and shows `…` instead.
- Coding fonts merge `->` into arrows; the esolang module disables `calt`/`liga`.
- Esolang: clear the pending live-recompile timer before starting a run, or the
  run gets reset.
- Noto Sans Math reports huge line metrics: Dingbats cards use flex rows and
  only scroll when content is really long.
- Text-presentation selector `U+FE0E` is appended to displayed symbols so they
  don't render as colour emoji; it is not included in copied text.

## How things were verified

Tests so far were ad hoc scripts (not saved in the repo):

- **Node unit checks** of the pure files (`braille.js`, `base64.js`,
  `dingbats.js`, `scripts.js`, `esolangs.js`): round trips, edge cases, and
  every generated esolang program run back to its input.
- **In-app checks:** an Electron harness that `require`s `electron/main.js`
  after `app.setPath('userData', <temp dir>)`, drives the page with
  `webContents.executeJavaScript`, and saves `capturePage()` screenshots.
- **The packaged AppImage:** launched with `--remote-debugging-port` and
  `--user-data-dir=<temp>`, then driven over the DevTools protocol.
- Always use a temporary user-data dir so the user's real history isn't touched.
- In the previous session, Claude Code's auto mode sometimes blocked shell
  commands mid-conversation; the Edit tool kept working when that happened.

## Open items / ideas

- Not a git repository yet. Suggest `git init` (a `.gitignore` already ignores
  `node_modules/`, `dist/`, `.tools/`, `src/vendor/`).
- Electron's spellchecker downloads an English dictionary from Google once
  (`~/.config/Prism/Dictionaries`). Offered to disable it (`spellcheck: false`
  in `webPreferences`) so the app is fully offline; not done.
- The esolang font-ligature fix wasn't visually re-checked (a screenshot run
  was blocked).
- The verification scripts could become a real `tests/` folder.

## Working with this user

- Writes short messages, sometimes ambiguous; when a request could mean two
  different things, ask with concrete options before building. The Braille AI
  modes were redone several times because of misread requests.
- Wants "cool" UIs: 3D effects, intros, animations, and everything modular.
- Prefers things to just work automatically (auto downloads, auto detection).
- Asked for changes to be reverted when they didn't fit. Keep changes scoped
  to what was asked.
