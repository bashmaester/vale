#!/usr/bin/env bash
# One-time browser setup for headless screenshots in a restricted sandbox.
#
# Problem: this environment has no system Chromium, and only the npm registry is
# reachable (no apt, no Playwright/Puppeteer CDN). `@sparticuz/chromium` ships a
# chromium binary inside its npm tarball, but that binary links against NSS/NSPR,
# which are not installed here.
#
# Solution: generate stub NSS/NSPR shared libraries exporting exactly the symbols
# the bundled binary needs. Chromium only touches NSS for client-certificate
# code paths, which a local screenshotting run never hits, so stubs are safe.
#
# Result: /tmp/nssstub/{libnspr4,libnss3,libnssutil3}.so
# Then:  npm run shots -- shots/latest 0,6,12,16
set -euo pipefail

DEST="${1:-/tmp/nssstub}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${VALE_TOOLS_DIR:-/tmp/vale-tools}"

mkdir -p "$DEST" "$TOOLS"

if [ ! -x "$TOOLS/node_modules/@sparticuz/chromium" ]; then
  echo "→ installing headless browser packages into $TOOLS"
  ( cd "$TOOLS" && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund \
      @sparticuz/chromium puppeteer-core >/dev/null )
fi

CHROME="$(cd "$TOOLS" && node -e "import('@sparticuz/chromium').then(async m=>{console.log(await m.default.executablePath())})")"
echo "→ chromium: $CHROME"

command -v gcc >/dev/null || { echo "gcc is required to build the stub libraries"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Every undefined symbol the binary wants, with its version tag.
nm -D --undefined-only "$CHROME" | awk '{print $NF}' | sort -u > "$WORK/undef.txt"

python3 - "$WORK" "$DEST" <<'PY'
import collections, re, sys, pathlib

work, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
lines = [l.strip() for l in work.joinpath('undef.txt').read_text().splitlines() if l.strip()]

lib_nss, lib_util = collections.defaultdict(list), collections.defaultdict(list)
nspr = []
nss_re = re.compile(r'^(NSS|NSSUTIL|CERT|PK11|SEC|SECMOD|SGN|VFY|HASH)')

for line in lines:
    name, _, ver = line.partition('@')
    if nss_re.match(name) and ver:
        target = lib_util if (name.startswith('NSSUTIL') or ver.startswith('NSSUTIL')) else lib_nss
        target[ver].append(name)
    elif name.startswith(('PR_', 'PL_', 'PORT_')):
        nspr.append(name)

def emit_c(syms_by_ver):
    out = ['/* generated stub — see scripts/setup-headless.sh */']
    for syms in syms_by_ver.values():
        out += [f'void *{s}(void) {{ return 0; }}' for s in syms]
    return '\n'.join(out) + '\n'

def emit_map(syms_by_ver):
    out = []
    for ver, syms in syms_by_ver.items():
        out.append(f'{ver} {{')
        out += ['  global:'] + [f'    {s};' for s in syms]
        out += ['  local: *;', '};']
    return '\n'.join(out) + '\n'

for stem, syms in (('nss', lib_nss), ('nssutil', lib_util)):
    work.joinpath(f'{stem}_stub.c').write_text(emit_c(syms))
    # An empty version script is a hard linker error, so never emit one.
    work.joinpath(f'{stem}.map').write_text(emit_map(syms) if syms else '')

# NSPR is needed unversioned. Only a handful of symbols, and PR_Now must return
# a real timestamp or Chromium's clock math breaks.
work.joinpath('nspr_stub.c').write_text(
    '#include <stdint.h>\n#include <time.h>\n'
    'int64_t PR_Now(void){struct timespec t;clock_gettime(CLOCK_REALTIME,&t);'
    'return (int64_t)t.tv_sec*1000000LL+t.tv_nsec/1000;}\n'
    'int PR_GetError(void){return 0;}\n'
    'int PR_GetOSError(void){return 0;}\n'
    'int PR_GetErrorTextLength(void){return 1;}\n'
    'char *PR_GetErrorText(void){static char e[1]={0};return e;}\n'
    'void PR_Init(void){}\n'
)
print(f'stub symbols: nss={sum(map(len, lib_nss.values()))} '
      f'nssutil={sum(map(len, lib_util.values()))} nspr={len(nspr)}')
PY

VERFLAG=()
[ -s "$WORK/nss.map" ] && VERFLAG+=("-Wl,--version-script=$WORK/nss.map")
gcc -shared -fPIC -o "$DEST/libnss3.so" "$WORK/nss_stub.c" "${VERFLAG[@]}"
VERFLAG=()
[ -s "$WORK/nssutil.map" ] && VERFLAG+=("-Wl,--version-script=$WORK/nssutil.map")
gcc -shared -fPIC -o "$DEST/libnssutil3.so" "$WORK/nssutil_stub.c" "${VERFLAG[@]}"
gcc -shared -fPIC -o "$DEST/libnspr4.so"    "$WORK/nspr_stub.c"

echo "→ stub libraries in $DEST:"
ls -1 "$DEST"

if ! LD_LIBRARY_PATH="$DEST" ldd "$CHROME" | grep -q 'not found'; then
  :
else
  echo "✗ still missing libraries:"
  LD_LIBRARY_PATH="$DEST" ldd "$CHROME" | grep 'not found' || true
  exit 1
fi
echo "✓ headless chromium is runnable (LD_LIBRARY_PATH=$DEST)"
