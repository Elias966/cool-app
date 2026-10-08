// electron-builder afterPack hook (Linux only).
//
// Recent distros (e.g. Ubuntu 24.04+) block the unprivileged user namespaces
// Chromium's sandbox needs, and an AppImage cannot ship a setuid
// chrome-sandbox helper. Without help the app would crash on launch, so the
// real binary is renamed and replaced by a tiny launcher that adds
// --no-sandbox only when the sandbox cannot work.

const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const name = context.packager.executableName;
  const dir = context.appOutDir;
  const bin = path.join(dir, name);
  const real = path.join(dir, `${name}-bin`);

  fs.renameSync(bin, real);
  fs.writeFileSync(
    bin,
    `#!/bin/bash
HERE="$(dirname "$(readlink -f "\${BASH_SOURCE[0]}")")"
USERNS=$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)
APPARMOR=$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)
if [ "$USERNS" != "1" ] || [ "$APPARMOR" = "1" ] || [ -n "$APPIMAGE" ]; then
  exec "$HERE/${name}-bin" --no-sandbox "$@"
fi
exec "$HERE/${name}-bin" "$@"
`,
    { mode: 0o755 }
  );
};
