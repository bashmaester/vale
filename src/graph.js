import { FRAGMENT_HEADER, FRAGMENT_HELPERS, NODE_DEFS, PRESETS } from './shaders.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export class ShaderGraph {
  constructor(defs = NODE_DEFS) {
    this.defs = defs;
    this.nodes = defs.map((d, i) => ({
      ...d,
      index: i,
      params: clone(d.params),
      enabled: d.enabled !== false,
      defEnabled: d.enabled !== false,
      ui: { ...d.ui },
    }));
    this.order = this.topoSort();
    this.revision = 1;
  }

  uniformName(nodeId, key) {
    return `u_${nodeId}_${key}`;
  }
  u(node, key) { return this.uniformName(node.id, key); }

  getNode(id) { return this.nodes.find((n) => n.id === id); }

  topoSort() {
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    const visited = new Set(), temp = new Set(), out = [];
    const visit = (id) => {
      if (visited.has(id)) return;
      if (temp.has(id)) throw new Error(`Cycle in look graph at ${id}`);
      temp.add(id);
      const n = byId.get(id);
      if (!n) throw new Error(`Unknown look node ${id}`);
      for (const dep of n.inputs) visit(dep);
      temp.delete(id);
      visited.add(id);
      out.push(n);
    };
    for (const n of this.nodes) visit(n.id);
    return out;
  }

  // A node is "live" only if it is switched on *and* at least one of its
  // driving strengths is non-zero. Anything else is stripped out of the shader
  // at compile time — no function, no uniforms, no call, no GPU cost. (Before
  // this, every node compiled in and early-returned on a uniform, which still
  // paid for the preamble and the dynamic branch.)
  isLive(n) {
    if (!n || n.enabled === false) return false;
    if (!n.bypass || n.bypass.length === 0) return true;
    return n.bypass.some((k) => {
      const p = n.params[k];
      return p ? Math.abs(Number(p.value) || 0) > 1e-6 : false;
    });
  }

  liveNodes() { return this.nodes.filter((n) => this.isLive(n)); }

  // Signature of the compiled program: changes only when a node crosses the
  // on/off line, so the renderer knows when a recompile is actually needed.
  activity() {
    return this.nodes.map((n) => (this.isLive(n) ? '1' : '0')).join('');
  }

  compile() {
    const uniforms = [];
    const funcs = [];
    const live = new Set();
    for (const n of this.nodes) {
      if (!this.isLive(n)) continue;
      live.add(n.id);
      for (const [key, p] of Object.entries(n.params)) {
        uniforms.push(`uniform ${p.type || 'float'} ${this.u(n, key)};`);
      }
      funcs.push(n.code(this, n));
    }
    const calls = this.order
      .filter((n) => live.has(n.id))
      .map((n) => `  c = n_${n.id}(c, uv, field);`).join('\n');
    // The gate weave lives in the shared helpers, so it needs its uniform only
    // when the source node survives compilation.
    const weave = live.has('source') ? this.u(this.getNode('source'), 'warp') : '0.0';
    return `${FRAGMENT_HEADER}
${uniforms.join('\n')}
${FRAGMENT_HELPERS}
${funcs.join('\n\n')}

void main(){
  vec2 uv = clamp(v_uv + gateWeave(v_uv, uTime, ${weave}), 0.0, 1.0);
  vec4 field = texture(uField, uv);
  vec4 c = texture(uInk, uv);
${calls}
  fragColor = c;
}
`;
  }

  uniformValues() {
    const out = {};
    for (const n of this.nodes) {
      if (!this.isLive(n)) continue;
      for (const [key, p] of Object.entries(n.params)) {
        if (p.type === 'vec2' || p.type === 'vec3') out[this.u(n, key)] = p.value;
        else out[this.u(n, key)] = p.value;
      }
    }
    return out;
  }

  setParam(id, key, value) {
    const n = this.getNode(id);
    if (!n || !n.params[key]) return false;
    n.params[key].value = Number(value);
    this.revision++;
    return true;
  }
  setEnabled(id, value) {
    const n = this.getNode(id);
    if (!n) return false;
    n.enabled = !!value;
    this.revision++;
    return true;
  }
  setNodePos(id, x, y) {
    const n = this.getNode(id);
    if (!n) return;
    n.ui.x = x; n.ui.y = y;
  }

  applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return false;
    // Start from "everything on": a preset that only lists strengths (or one
    // that switched nodes off, like `plate`) must not leak its flags into the
    // next preset.
    for (const n of this.nodes) n.enabled = n.defEnabled !== false;
    for (const [id, vals] of Object.entries(p.graph || {})) {
      const n = this.getNode(id);
      if (n && typeof vals.enabled === 'boolean') n.enabled = vals.enabled;
      for (const [k, v] of Object.entries(vals)) {
        if (k === 'enabled') continue;
        this.setParam(id, k, v);
      }
    }
    this.revision++;
    return p;
  }

  toJSON() {
    const params = {};
    for (const n of this.nodes) {
      params[n.id] = { enabled: n.enabled };
      for (const [k, p] of Object.entries(n.params)) params[n.id][k] = p.value;
    }
    return { version: 1, params, ui: this.nodes.map((n) => ({ id: n.id, x: n.ui.x, y: n.ui.y })) };
  }

  fromJSON(data) {
    if (!data || !data.params) return false;
    for (const [id, vals] of Object.entries(data.params)) {
      const n = this.getNode(id);
      if (!n) continue;
      if (typeof vals.enabled === 'boolean') n.enabled = vals.enabled;
      for (const [k, v] of Object.entries(vals)) {
        if (k === 'enabled') continue;
        if (n.params[k] && Number.isFinite(Number(v))) n.params[k].value = Number(v);
      }
    }
    if (Array.isArray(data.ui)) {
      for (const p of data.ui) {
        const n = this.getNode(p.id);
        if (n && Number.isFinite(p.x) && Number.isFinite(p.y)) { n.ui.x = p.x; n.ui.y = p.y; }
      }
    }
    this.revision++;
    return true;
  }

  reset() {
    this.nodes.forEach((n, i) => {
      n.enabled = this.defs[i].enabled !== false;
      for (const [k, p] of Object.entries(n.params)) n.params[k].value = this.defs[i].params[k].value;
      n.ui = { ...this.defs[i].ui };
    });
    this.revision++;
  }
}

export { PRESETS };
