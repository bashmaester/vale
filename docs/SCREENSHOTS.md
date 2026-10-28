# Screenshots — how to look at the scene

Two complementary tools. Use both depending on the question.

| Tool | Command | What it renders | Needs a browser? |
| --- | --- | --- | --- |
| Plate stills | `npm run stills` | the 2D ink **plate**, pre-shader, via `@napi-rs/canvas` | no |
| Film stills | `npm run shots` | the **final composited film**, through the real WebGL2 look pipeline | yes (one-time setup) |

`npm run stills` (`tools/shot.mjs`) is the fast loop: it renders the actual
scene modules into a real Canvas2D implementation, so composition, density and
line weight can be judged directly. Output goes to `.shots/` (gitignored).

`npm run shots` (`scripts/shoot.mjs`) is the final check: it boots the built
self-contained `index.html` in headless Chromium and screenshots what a viewer
actually sees, including every shader node. Use it when the question is about
the *look* — grain, hatching, palette separation, posterization — because none
of that exists on the plate.

---

## One-time setup for `npm run shots`

This sandbox has **no system Chromium**, and only the npm registry is reachable
(no apt, no Playwright/Puppeteer download CDN). The browser therefore comes from
the `@sparticuz/chromium` npm tarball, which bundles a chromium binary. That
binary links against NSS/NSPR, which are not installed here, so
`scripts/setup-headless.sh` compiles stub shared libraries exporting exactly the
symbols it needs. Chromium only touches NSS for client-certificate paths, which
screenshots never reach.

```bash
npm run setup:browser
```

It prints the stub symbols and ends with:

```
✓ headless chromium is runnable (LD_LIBRARY_PATH=/tmp/nssstub)
```

Requirements: `gcc`, `python3`, `nm`. Override paths with `VALE_TOOLS_DIR`
(browser packages, default `/tmp/vale-tools`) or pass a stub dir as the first
argument.

> The browser packages are deliberately **not** a dependency of this repo — they
> are large and CI never needs them. `scripts/shoot.mjs` resolves them from
> `VALE_TOOLS_DIR` when they are absent from `node_modules`.

## Take film stills

```bash
npm run build        # index.html must exist
npm run serve &      # http://127.0.0.1:8123
npm run shots        # → shots/latest/t0.png t6.png t12.png t16.png
```

Positional arguments:

```bash
node scripts/shoot.mjs <out-dir> [times] [w] [h] [extra-query]

node scripts/shoot.mjs shots/pass 0,6,12,16 1440 810
node scripts/shoot.mjs shots/tiles 7 1440 810 '&size=3'
```

The film's own query params pass through `extra-query` — `&palette=`, `&finish=`,
`&cam=`, `&world=`, `&size=`, `&tiles=`, `&diag=`. See `scene.toUrl()`.

Environment overrides: `VALE_ORIGIN` (default `http://127.0.0.1:8123`),
`VALE_NSS_DIR` (default `/tmp/nssstub`), `VALE_TOOLS_DIR`.

Check the `webgl2` field in the printed JSON. If it is `false` you are
screenshotting the 2D fallback composite, not the real look pipeline — treat the
image as invalid for art-direction decisions.

---

## Reference frames

`docs/shots/compare-branches.jpg` — `t=0` at 1440×810 from two branches:

- left: this branch's tile set (`6a57a47`),
- right: an earlier single-corner pass (`b5f212d`), kept only as a record of the
  superseded film reading of the brief.

See `docs/BRANCH_COMPARISON.md` for why that branch exists and what, if anything,
was worth taking from it.

## History worth keeping

An earlier session concluded it could not validate anything visually and tuned
the look by reasoning about code for several turns. When stills finally existed,
one glance found that `p.box()` was filling every face with a colour almost
identical to the background — every building was drawing as a bare wireframe.
The lesson is cheap to state: **render it and look at it before believing a
visual change landed.** Both tools above exist for that.
