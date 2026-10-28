# Screenshots — how to actually look at the film

Art direction in this repo is only trustworthy when it is checked against a real
render. Every earlier turn tuned the look by reasoning about code, and the
result was a build the user called "very underwhelming". A headless screenshot
path now exists so that cannot happen again by default.

> ⚠️ This harness matters more than this branch does. The branch is superseded
> (`docs/BRANCH_COMPARISON.md`), but the harness is portable and worth carrying
> to `arena/bab4bc10-vale`. It already works against that build — it honours the
> same `?paused=`/`?t=` params.

**Rule:** after any change to `src/environment.js`, `src/camera.js`,
`src/crowd.js`, `src/weather.js`, `src/draw.js` or `src/shaders.js`, take
stills and *look at them* before claiming the change landed.

---

## One-time setup

The sandbox has **no system Chromium**, and only the npm registry is reachable
(no apt, no Playwright / Puppeteer download CDN). The browser therefore comes
from the `@sparticuz/chromium` npm tarball, which bundles a chromium binary.
That binary links against NSS/NSPR, which are not installed here, so
`scripts/setup-headless.sh` compiles stub shared libraries exporting exactly the
symbols it needs. Chromium only touches NSS for client-certificate paths, which
screenshots never reach.

```bash
npm run setup:browser          # builds /tmp/nssstub + installs browser packages
```

It prints the stub symbols and finishes with:

```
✓ headless chromium is runnable (LD_LIBRARY_PATH=/tmp/nssstub)
```

Requirements: `gcc`, `python3`, `nm` (binutils). Override paths with
`VALE_TOOLS_DIR` (browser packages, default `/tmp/vale-tools`) and pass a
different stub dir as the first argument.

> The browser packages are deliberately **not** a dependency of this repo — they
> are large and CI does not need them. `scripts/shoot.mjs` resolves them from
> `VALE_TOOLS_DIR` when they are absent from `node_modules`.

## Take stills

```bash
npm run build                                  # index.html must exist first
npm run serve &                                # http://127.0.0.1:8123
npm run shots                                  # 0,6,12,16 → shots/latest/
```

Arguments are positional:

```bash
node scripts/shoot.mjs <out-dir> [times] [w] [h] [extra-query]

node scripts/shoot.mjs shots/pass 0,6,12,16 1440 810
node scripts/shoot.mjs shots/lab 7 1440 810 '&lab=1'
```

The film's own query params still apply through `extra-query`, e.g. `&preset=riso`
or `&cam=fly`. The harness pauses the film at each time, waits for the WebGL2
context, and writes a PNG per time.

Environment overrides: `VALE_ORIGIN` (default `http://127.0.0.1:8123`),
`VALE_NSS_DIR` (default `/tmp/nssstub`), `VALE_TOOLS_DIR`.

Check the `webgl2` field in the printed JSON. If it is `false` you are
screenshotting the 2D fallback, not the real print pipeline.

## The four beats

`docs/shots/` holds the reference frames for the current look:

| File | Beat | What to look for |
| --- | --- | --- |
| `before-t0.jpg` | WAIT (before this pass) | wireframes in a void — the failure mode |
| `before-t12.jpg` | CROSS (before this pass) | transparent buildings, unreadable crowd |
| `after-t0.jpg` | WAIT | solid masses, street reads, paper windows |
| `after-t16.jpg` | TRAFFIC | empty street, backdrop depth, signals |
| `compare-branches.jpg` | t=0 | `bab4bc10` (ahead) vs this branch — see `BRANCH_COMPARISON.md` |

## What the comparison already established

The screenshots are what diagnosed the real problems, none of which were
visible from reading code:

1. **Volumes were invisible.** `p.box()` filled every face with `PALETTE.black`
   (`#050605`) against a `#070807` background, so buildings and sidewalks
   rendered as bare wireframe outlines. This single bug is most of why the film
   read as a CAD diagram.
2. **Buildings were painted in array order,** so far facades overpainted near
   ones and the block looked transparent.
3. **~70% of the frame was empty black** with the set floating in the middle.
4. **The print shaders painted noise across empty paper** — the whole frame was
   covered in mottled static that swamped the artwork.
5. **The camera was an aerial plan** of a whole junction rather than one corner.

## Still open (needs the next session's eye)

- Unlit coarse hatch still leaves faint marble swirls on large facades.
- Umbrella canopies read as thin ellipses rather than varied silhouettes; the
  handoff references ask for more varied umbrella shapes.
- Crowd reads well in the mass but individual figures are still thin at 1440px.
- Rain and puddles are present in simulation but barely read in a still.
- The 20s cycle has not been judged in motion, only as stills.
