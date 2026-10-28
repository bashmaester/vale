# Branch comparison — 2026-10-28

Written after a session on `arena/45e6b5a9-vale` discovered it had been building
on the wrong base.

> **Status: resolved.** `arena/45e6b5a9-vale` now contains the full
> `arena/bab4bc10-vale` tree (`6a57a47`) — no tracked file was modified, `src/`
> diffs empty against it. The superseded art pass was discarded. Only items 1–4
> under “what is worth salvaging” were kept, and of those only the **screenshot
> harness** was actually portable (the rest were fixes for code that no longer
> exists on this branch). The analysis below is kept as the record of a costly
> process mistake.

## The finding

`main` (`de04b9a`) was not the newest work. `arena/bab4bc10-vale` (`6a57a47`,
2026-10-27 23:00) is **21 commits ahead**, and `main` is fully contained in it —
same lineage, no fork.

| | `arena/bab4bc10-vale` | `arena/45e6b5a9-vale` |
| --- | --- | --- |
| Tip | `6a57a47` 2026-10-27 23:00 | `b5f212d` 2026-10-28 02:41 |
| Commits ahead of `main` | **21** | 2 |
| Brief it serves | **indie sim engine foundation** + tileable volume (redefined by the user in that session) | one-corner "film" reading of the original brief |
| Tiles / cells | `src/tiles.js`, `src/cells.js`, `src/tile.js` | none |
| Editor | `src/sidebar.js` minimap tile editor | hidden patch-bay lab only |
| Cameras | `camera-director.js`, `camera-modes.js` | one rig |
| LoD | yes (`tools/lod.mjs`, far-layer LoD) | none |
| Loop | bit-exact 20 s loop, verified | intended 20 s cycle |
| Tests | `tools/` 14 files, `npm run verify` | none |
| CI trigger | any branch | any branch (added here) |
| Releases | tags `v0.1.1` … `v0.1.6` | none |

`npm run verify` on `bab4bc10` passes, including:
`t=0 fa82729bf8d4 vs t=20 fa82729bf8d4 … determinism check ok: looping every 20s, bit-exact`.

**`bab4bc10` is ahead on architecture, tooling, test coverage and visual
richness. `45e6b5a9` is ahead on exactly one thing: someone finally looked at a
render.**

## Visual comparison

`docs/shots/compare-branches.jpg` (both at `t=0`, 1440×810, same harness):

- **`bab4bc10` — left.** Dense 3×3 tile city seen from above the glass case:
  layered buildings with sills and glazing, lit shopfronts, curbs, crosswalks on
  both streets, trees, traffic signals, ambient red/teal light bleed, haze.
  Reads as a place.
- **`45e6b5a9` — right.** One corner, sparse and flat: solid but plain blocks, a
  flat black sky, a crowd of thin figures, visible hatched/marbled texture on
  large masses. Reads as a blockout.

The honest verdict: **`bab4bc10` is the better-looking film and the far more
advanced codebase.** This branch's only genuine edge is the observation that
the render was never being checked, which `bab4bc10` has since addressed far
more thoroughly (boot smoke tests, strict canvas guards, renderer smoke,
finiteness and determinism checks).

## What is genuinely worth salvaging from `45e6b5a9`

Small, specific, and portable — not a merge:

1. **Headless screenshot harness.** `scripts/setup-headless.sh` +
   `scripts/shoot.mjs`. Builds stub NSS/NSPR shared libraries so the
   `@sparticuz/chromium` npm tarball runs with no apt and no Playwright CDN.
   `docs/SCREENSHOTS.md` documents it. This is sandbox plumbing, useful anywhere.
2. **The shaded-mass fix.** `p.box()` used to fill faces with `PALETTE.black`
   (`#050605`) against a `#070807` background, so volumes drew as outlines over
   nothing. Fixed with a print tonal ladder (`PALETTE.massFront/massSide/
   massTop/massDeep`) + `faceTone()` + `box({ shade: true, fillFor })`.
   Check whether `bab4bc10` has an equivalent — its building masses look solid,
   so it may already be handled or moot.
3. **Painter's ordering for building lots** (`drawBuildings()` sorts far→near).
   Again check whether `bab4bc10`'s per-tile depth-sorted item list already
   covers this.
4. **Coverage-gating print effects to plate luma**, so `carve`/`detail`/`hatch`/
   `paper` do not fog empty paper. `bab4bc10`'s look pipeline differs, so this
   needs re-deriving rather than copying.

## What should NOT be merged

- The one-corner camera keys, the 34-block backdrop ring, and the environment
  tonal values: all authored for a single-corner film, not a tiled volume with
  a glass case. They would fight `bab4bc10`'s camera director and tile system.
- `docs/*` from this branch wholesale. `bab4bc10`'s docs describe the engine
  brief; overwriting them would lose the real specification.

A full merge attempt produces **15 conflicts** (`index.html`, `package.json`,
`src/camera.js`, `src/environment.js`, `src/shaders.js`, `docs/HANDOFF.md`,
`docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/CURRENT_STATE.md`, README and
four generated docs files) — and the generated `index.html`/`docs/*` conflicts
are noise that a rebuild resolves anyway. Merging is the wrong instrument here;
porting items 1–4 by hand onto `bab4bc10` is the right one.

## Live site

`bab4bc10`'s deploy ran at 2026-10-27 23:00 (run `40599010516`). Because the
workflow triggers on any branch, the two pushes from `45e6b5a9` (`40622188018`,
`40622433093`) each redeployed over it, so **the live site now serves this
branch's build.** That integration lacks Actions write scope (403 on both
`workflow_dispatch` and run re-run), so it cannot be restored from here. A push
to `bab4bc10` restores it.
