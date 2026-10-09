# Brief: make Prism modules work on Android phones and tablets

Prism (repo at /home/user/cool-app) is an Electron desktop app whose UI is plain
HTML/CSS/JS in `src/`. Each page is a module in `src/modules/<id>/` (index.js +
style.css). We are shipping the same `src/` inside an Android WebView app
("android version/"). The desktop layouts were designed for a ~1200x750 stage
and break on phones. Your job: make your assigned module(s) look and work great
on phones (portrait and landscape) and tablets, WITHOUT changing the desktop look.

## Rules
- Edit ONLY your module's files: `src/modules/<id>/style.css` (preferred: append one
  "phones and tablets" section at the end) and, only if CSS truly can't do it, small
  changes in `src/modules/<id>/index.js`. Never edit src/core/*, other modules, or
  anything under "android version/". Do not commit or push; the lead will.
- Every selector must stay scoped to the module's class prefix (e.g. `.dg-…`), as all
  module CSS already is. `.handheld` and `.platform-android` body classes may be used
  as an ancestor (e.g. `.handheld .dg-hint`).
- Desktop must be unchanged: all new rules go inside the media queries below (or
  under `.handheld`). Desktop Electron is a mouse device with a window ≥ 900px wide.
- Entrance animations use `backwards` fill (house rule) — keep it if you add any.
- Match the existing code style (compact one-line rules, short comments).

## Standard media queries (use exactly these so all modules agree)
- PHONE (portrait phones, small tablets in portrait):
  `@media (max-width: 599px), (max-width: 760px) and (orientation: portrait)`
- LANDSCAPE PHONE (short and wide):
  `@media (max-height: 520px) and (min-width: 600px)`
- STACK (any screen too narrow for the two-column desktop layout: phones, landscape
  phones, tablets in portrait):
  `@media (max-width: 1000px) and (hover: none), (max-width: 760px), (max-height: 520px) and (min-width: 600px)`
- KEYBOARD OPEN (portrait phone whose viewport shrank because the on-screen keyboard
  is up; the shell hides its tab bar then):
  `@media (max-width: 760px) and (orientation: portrait) and (max-height: 560px)`
- TOUCH: `@media (pointer: coarse)` → finger-sized targets (≥ 38px tall chips/buttons
  where reasonable, ~44px for primary actions).

## What the shell already does (src/core, done by the lead)
- Phones: slim title bar on top (50px + status bar), a bottom tab bar (the module
  dock), and the module view (`section.view`, which IS your module root element, e.g.
  `section.view.dg`) fills the space between. View is ~393x700 on a typical phone,
  360x~520 on a small one. Landscape phones: slim left rail, view ≈ 790x340.
  Tablet portrait 800x1280: desktop-style left dock, view ≈ 708x1180.
  Tablet landscape 1280x800: like desktop (view ≈ 1188x740) — usually only touch-target
  sizing is needed there.
- `body.handheld` = touch device. On handhelds, programmatic `.focus()` on text fields is
  suppressed unless the keyboard is already up (so modules don't pop the keyboard).
- Hover sounds/tilt/magnetic effects are already disabled for touch.
- The root element of a module has `overflow: hidden` + `height: 100%` (flex column).
  It is ALSO the scroll container (`.view`). Careful: absolutely positioned decorations
  (intro canvases with inset:0 are fine; big "shock"/glow elements are not) extend the
  scrollable area and the browser may scroll an overflow:hidden root when something gets
  focus. `overflow: clip` stops that if the root should not scroll at all.

## Layout guidance
- Two-column modules (`.X-main` grid of left column + `.X-side`): in STACK, use a single
  column. Good pattern: let the root scroll (`overflow: hidden auto` on the root, children
  `flex: none`), give the feed/history a fixed viewport-relative height (e.g.
  `height: clamp(260px, 48svh, 560px)`, it scrolls internally), put the console (text box)
  right after the feed, and the side panels (pickers, keyboards, charts, info) after the
  console. `display: contents` on `.X-main`/`.X-left` + `order` on the pieces is a handy
  way to reorder; if you do that, re-check the intro "hidden until ready" rules that set
  `opacity: 0` on wrappers (opacity on a display:contents box does nothing) and apply them
  to the children instead.
- Alternatively, if everything fits, keep a non-scrolling flex layout like the braille
  reference (feed flexes, head is compact).
- Heads: compact. The title bar already shows the module name, so the small "MODULE · …"
  badge can be hidden on phones. Titles ~26–32px. Decorative head widgets (rings, gauges,
  emblems) should shrink or tuck beside the title; functional ones (font/script pickers,
  tabs) must stay usable — horizontal scrollers with `overflow-x: auto; scrollbar-width:
  none` and `scroll-snap` work well.
- Nothing may overflow the screen horizontally (no sideways page scroll). Inner
  horizontal scrollers are fine when intentional.
- Hide keyboard-only hints (Enter/Shift/Esc kbd hints, "use F D S J K L" etc.) under
  `.handheld`.
- Send buttons on phones can become icon-only squares if the label is in a span (check
  any "busy/Stop" state that relies on the label).
- Text inputs: font-size ≥ 16px on phones.
- KEYBOARD OPEN: hide the head and anything non-essential so the feed + text box fit.
- Keep the module's character (glow, 3D, animation); just make it fit.

## Reference implementation
`src/modules/braille/style.css` — the section starting at the comment
"phones and tablets" near the end of the file is the finished braille version. Read it
first. (Braille is a single-column module, so it kept a non-scrolling layout.)

## How to test
A Playwright harness serves `src/` live (no rebuild needed) with a fake Android bridge
and takes screenshots:

    cd tests/mobile   # from the repo root
    OUT=$PWD/out-<id>/ node mobile-test.mjs phone,small,landscape,tablet,tabletLand <id>

It prints per device: count of elements overflowing the screen horizontally (with the
first offenders), and buttons smaller than 32px. Screenshots land in OUT as
`<device>-<id>.png` at 2x/1.5x scale; downscale before viewing to save tokens
(`convert in.png -resize 50% out.png`) and look at them with the Read tool. Devices:
phone 393x852, small 360x640, landscape 852x393, tablet 800x1280, tabletLand 1280x800.
Use a separate OUT dir per module (other helpers run in parallel).

Also test real use on a phone: copy mobile-test.mjs to your own script (e.g.
`int-<id>.mjs`) and drive the page: fill the module's textarea, press its send button,
switch modes/tabs, open pickers, and screenshot the results (cards with output must fit
the width; long outputs wrap or scroll inside their card). Also check desktop is
unchanged: same harness at viewport 1320x840 with `isMobile: false, hasTouch: false`
before/after your change should look identical (save a "before" desktop screenshot first!).
Chromium is at /opt/pw-browsers/chromium; playwright is required from
/opt/node-tools/node_modules/ (see the harness). Don't kill processes by name
(`pkill -f` can kill your own shell); there is nothing to kill anyway.

## Report back
A short summary: what you changed per device class, anything you could not fix, and
the paths of final screenshots (phone, small, landscape, tablet) for the lead to review.
