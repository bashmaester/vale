// Colour palettes: the ink and the paper the whole film is printed with.
//
// Every mark in the scene is drawn through Painter, and every colour the
// Painter is handed is graded here before it reaches the canvas. That means a
// palette is one lookup that repaints everything — no drawing module needs to
// know which palette is active, and the cached set simply invalidates.
//
// The grade is a monotone two-colour ramp (paper → ink) with the saturated
// colours of the plate pushed onto the palette's two accents. Dark palettes
// keep the night look; light palettes turn the same drawing into ink on paper
// without a single geometry change.
//
//   mobius   the authored black / bone / red / teal night
//   patent   warm paper, blue-black ink, vermilion and blueprint accents
//   ink      bone ink on black, no chroma at all, hard contrast
//   bw       black on white, neutral, hard contrast
//   custom   the same ramp, with colours the user picks

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const PALETTES = {
  mobius: {
    id: 'mobius', label: 'Möbius',
    paper: '#060707', ink: '#efe9d8', accent: '#d43b30', accent2: '#2bb8ae',
    contrast: 1.0, gamma: 1.0, mix: 1.0, glow: 1.0, name: 'mobius',
  },
  patent: {
    id: 'patent', label: 'Patent sketch',
    paper: '#f1ead8', ink: '#22334a', accent: '#a8402f', accent2: '#2f6f86',
    contrast: 1.0, gamma: 0.55, mix: 0.92, glow: 0.34, name: 'patent',
  },
  ink: {
    id: 'ink', label: 'Ink',
    paper: '#0b0b0c', ink: '#f2eee2', accent: '#f2eee2', accent2: '#c9c4b4',
    contrast: 1.2, gamma: 1.0, mix: 0, glow: 0.8, name: 'ink',
  },
  bw: {
    id: 'bw', label: 'B / W',
    paper: '#f7f6f1', ink: '#101113', accent: '#101113', accent2: '#33343a',
    contrast: 1.22, gamma: 0.62, mix: 0, glow: 0.3, name: 'bw',
  },
  custom: {
    id: 'custom', label: 'Custom',
    paper: '#0a0c10', ink: '#f0e8d6', accent: '#d4623a', accent2: '#3aa8c8',
    contrast: 1.0, gamma: 0.9, mix: 0.95, glow: 0.9, name: 'custom',
  },
};

const STORE_KEY = 'vale.palette.v1';

function hex2rgb(h) {
  const s = h.trim();
  if (s[0] !== '#') return null;
  let v = s.slice(1);
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  if (v.length !== 6) return null;
  const n = parseInt(v, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

// Fast path for the strings the drawing code actually produces:
// "#rrggbb", "rgba(r,g,b,a)", "rgb(r,g,b)", "r,g,b".
function parse(str) {
  if (typeof str !== 'string') return null;
  if (str[0] === '#') return hex2rgb(str);
  const m = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    return {
      r: +m[1], g: +m[2], b: +m[3],
      a: m[4] == null ? 1 : clamp(+m[4], 0, 1),
    };
  }
  const t = str.match(/^([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)$/);
  if (t) return { r: +t[1], g: +t[2], b: +t[3], a: 1 };
  return null;
}

const rgba = (c) => c.a >= 0.999
  ? `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
  : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(3)})`;

let active = { ...PALETTES.mobius };
let version = 0;
let listeners = [];
const cache = new Map();
const rgbCache = new Map();

function applyPreset(id) {
  const p = PALETTES[id] || PALETTES.mobius;
  active = {
    ...p,
    paperRgb: parse(p.paper),
    inkRgb: parse(p.ink),
    accentRgb: parse(p.accent),
    accent2Rgb: parse(p.accent2),
  };
  version++;
  cache.clear();
  rgbCache.clear();
  // The page behind the canvas follows the paper, so a light palette is not a
  // print floating on a black page. Guarded: the headless boot has only a
  // minimal DOM, and a palette must never be able to break startup.
  if (typeof document !== 'undefined') {
    const de = document.documentElement;
    if (de && de.style) de.style.background = p.paper;
    const body = document.body;
    if (body) {
      body.dataset = body.dataset || {};
      body.dataset.palette = p.id;
    }
  }
  for (const fn of listeners) {
    try { fn(p.id); } catch (e) { /* a listener must never break a frame */ }
  }
}

function mix(a, b, t) { return a + (b - a) * t; }

function gradeCore(c, out) {
  const p = active;
  if (p.id === 'mobius') return c;
  const l = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  // The ramp runs from paper (the dark of the plate) to ink (the light), with
  // a gamma first so the asphalt and the pavement keep some weight instead of
  // all collapsing into paper, then a contrast pivot at mid grey.
  const g0 = Math.pow(clamp(l, 0, 1), p.gamma == null ? 1 : p.gamma);
  const t = clamp((g0 - 0.5) * p.contrast + 0.5, 0, 1);
  let r = mix(p.paperRgb.r, p.inkRgb.r, t);
  let g = mix(p.paperRgb.g, p.inkRgb.g, t);
  let b = mix(p.paperRgb.b, p.inkRgb.b, t);

  // Accents: anything clearly warm or cool keeps a colour, so the reds of the
  // traffic and the teals of the signs survive the palette instead of being
  // crushed into the ramp.
  if (p.mix > 0) {
    const mx = Math.max(c.r, c.g, c.b);
    const mn = Math.min(c.r, c.g, c.b);
    const chroma = (mx - mn) / 255;
    if (chroma > 0.04) {
      const warm = clamp((c.r - Math.max(c.g, c.b)) / 70, 0, 1);
      const cool = clamp((Math.max(c.g, c.b) - c.r) / 70, 0, 1);
      const w = clamp(chroma * p.mix * 2.6, 0, 1);
      if (warm > 0.001) {
        const k = warm * w;
        r = mix(r, p.accentRgb.r, k);
        g = mix(g, p.accentRgb.g, k);
        b = mix(b, p.accentRgb.b, k);
      }
      if (cool > 0.001) {
        const k = cool * w;
        r = mix(r, p.accent2Rgb.r, k);
        g = mix(g, p.accent2Rgb.g, k);
        b = mix(b, p.accent2Rgb.b, k);
      }
    }
  }
  out.r = r; out.g = g; out.b = b; out.a = c.a;
  return out;
}

/**
 * Grade any canvas colour string. Returns the input untouched for the palette
 * it was authored in, so the default look costs nothing but a comparison.
 */
export function grade(str) {
  if (active.id === 'mobius') return str;
  if (typeof str !== 'string') return str;
  const hit = cache.get(str);
  if (hit !== undefined) return hit;
  const c = parse(str);
  if (!c) return str;
  const out = rgba(gradeCore(c, {}));
  // Colours with animated alpha would grow the cache without bound; a few
  // thousand entries is more than a frame can touch, so it is simply dropped.
  if (cache.size > 4096) cache.clear();
  cache.set(str, out);
  return out;
}

/** Grade a bare "r,g,b" used by the glow sprites. */
export function gradeRgb(str) {
  if (active.id === 'mobius' || typeof str !== 'string') return str;
  const hit = rgbCache.get(str);
  if (hit !== undefined) return hit;
  const c = parse(str);
  if (!c) return str;
  const o = gradeCore({ ...c, a: 1 }, {});
  const out = `${Math.round(o.r)},${Math.round(o.g)},${Math.round(o.b)}`;
  rgbCache.set(str, out);
  return out;
}

export function setPalette(id, custom) {
  if (id === 'custom' && custom) {
    Object.assign(PALETTES.custom, custom);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(PALETTES.custom)); } catch (e) { /* private mode */ }
    }
  }
  applyPreset(id);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(`${STORE_KEY}.id`, id); } catch (e) { /* private mode */ }
  }
  return active;
}

export function currentPalette() { return active; }
/** How much of the additive glow the active palette can take before it burns. */
export function glowScale() { return active.glow == null ? 1 : active.glow; }
export function paletteVersion() { return version; }
export function onPaletteChange(fn) { listeners.push(fn); return () => { listeners = listeners.filter((f) => f !== fn); }; }

/** Restore the saved palette (custom colours included) at boot. */
export function loadPalette() {
  let id = 'mobius';
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) Object.assign(PALETTES.custom, JSON.parse(saved));
      id = localStorage.getItem(`${STORE_KEY}.id`) || 'mobius';
    } catch (e) { id = 'mobius'; }
  }
  applyPreset(PALETTES[id] ? id : 'mobius');
  return id;
}

// The paper the plate is cleared to. It is graded like everything else, so a
// light palette starts from a light plate rather than a black hole.
export const PLATE_CLEAR = '#050605';
