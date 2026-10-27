// Scene Graph - Modular, node-based scene composition
// Each scene is a directed graph of modules with connection rules

export class SceneNode {
  constructor(type, params = {}) {
    this.id = SceneNode._nextId++;
    this.type = type;
    this.params = { ...params };
    this.children = [];
    this.connections = []; // { target: SceneNode, port: string, strength: number }
    this.parent = null;
    this.position = params.position || [0, 0, 0];
    this.rotation = params.rotation || [0, 0, 0];
    this.scale = params.scale || [1, 1, 1];
    this.metadata = {};
  }

  addChild(node) {
    node.parent = this;
    this.children.push(node);
    return this;
  }

  removeChild(node) {
    const idx = this.children.indexOf(node);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      node.parent = null;
    }
    return this;
  }

  connect(target, port = 'default', strength = 1.0) {
    this.connections.push({ target, port, strength });
    return this;
  }

  disconnect(target) {
    this.connections = this.connections.filter(c => c.target !== target);
    return this;
  }

  getDescendants() {
    const result = [this];
    for (const child of this.children) {
      result.push(...child.getDescendants());
    }
    return result;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      params: this.params,
      position: this.position,
      rotation: this.rotation,
      scale: this.scale,
      connections: this.connections.map(c => ({
        target: c.target.id,
        port: c.port,
        strength: c.strength,
      })),
      children: this.children.map(c => c.toJSON()),
    };
  }

  static fromJSON(data, registry) {
    const node = new SceneNode(data.type, data.params);
    node.position = data.position;
    node.rotation = data.rotation;
    node.scale = data.scale;
    return node;
  }
}

SceneNode._nextId = 1;

// Connection rules define which module types can connect
export class ConnectionRules {
  constructor() {
    this.rules = new Map();
  }

  // Define that type A can connect to type B on given ports
  addRule(fromType, toType, ports = ['default'], maxConnections = Infinity) {
    const key = `${fromType}:${toType}`;
    this.rules.set(key, { fromType, toType, ports, maxConnections });
    return this;
  }

  canConnect(fromNode, toNode, port = 'default') {
    const key = `${fromNode.type}:${toNode.type}`;
    const rule = this.rules.get(key);
    if (!rule) return false;
    if (!rule.ports.includes(port) && !rule.ports.includes('*')) return false;
    // Check max connections
    const existing = fromNode.connections.filter(c => c.target.type === toNode.type).length;
    if (existing >= rule.maxConnections) return false;
    return true;
  }

  getCompatibleTypes(nodeType) {
    const compatible = [];
    for (const [key, rule] of this.rules) {
      if (key.startsWith(`${nodeType}:`)) {
        compatible.push(rule.toType);
      }
    }
    return compatible;
  }
}

// Scene registry - manages all available scene modules
export class SceneRegistry {
  constructor() {
    this.modules = new Map();
    this.rules = new ConnectionRules();
  }

  registerModule(type, factory, meta = {}) {
    this.modules.set(type, { type, factory, meta });
    return this;
  }

  createNode(type, params = {}) {
    const mod = this.modules.get(type);
    if (!mod) throw new Error(`Unknown module type: ${type}`);
    return new SceneNode(type, params);
  }

  getModuleInfo(type) {
    return this.modules.get(type);
  }

  getAllTypes() {
    return Array.from(this.modules.keys());
  }

  // Organic growth: given a node, return valid expansion options
  getGrowthOptions(node) {
    const compatible = this.rules.getCompatibleTypes(node.type);
    return compatible.map(type => ({
      type,
      meta: this.modules.get(type)?.meta || {},
    }));
  }
}

// Scene manager - top-level scene composition and transitions
export class SceneManager {
  constructor(registry) {
    this.registry = registry;
    this.scenes = new Map();
    this.activeScene = null;
    this.transitioning = false;
  }

  createScene(name, rootNode) {
    const scene = {
      name,
      root: rootNode,
      createdAt: Date.now(),
      modules: new Map(),
    };
    this.scenes.set(name, scene);
    this._indexModules(scene);
    return scene;
  }

  _indexModules(scene) {
    const allNodes = scene.root.getDescendants();
    for (const node of allNodes) {
      scene.modules.set(node.id, node);
    }
  }

  setActiveScene(name) {
    const scene = this.scenes.get(name);
    if (!scene) throw new Error(`Scene not found: ${name}`);
    this.activeScene = scene;
    return scene;
  }

  // Grow a scene organically by adding a module connected to an existing node
  growScene(sceneName, anchorNodeId, newType, params = {}) {
    const scene = this.scenes.get(sceneName);
    if (!scene) throw new Error(`Scene not found: ${sceneName}`);

    const anchor = scene.modules.get(anchorNodeId);
    if (!anchor) throw new Error(`Anchor node not found: ${anchorNodeId}`);

    const newNode = this.registry.createNode(newType, params);

    // Find a valid connection
    if (this.registry.rules.canConnect(anchor, newNode)) {
      anchor.connect(newNode);
    }

    // Add as child of scene root for now (spatial placement handled by module)
    scene.root.addChild(newNode);
    scene.modules.set(newNode.id, newNode);

    return newNode;
  }

  // Transition between scenes
  async transition(fromScene, toScene, duration = 1.5) {
    if (this.transitioning) return;
    this.transitioning = true;

    const start = performance.now();
    return new Promise(resolve => {
      const step = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / (duration * 1000), 1);
        // Eased transition
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        resolve({ progress: eased, fromScene, toScene });
        if (t < 1) requestAnimationFrame(step);
        else {
          this.transitioning = false;
          this.activeScene = this.scenes.get(toScene);
        }
      };
      requestAnimationFrame(step);
    });
  }

  getAllScenes() {
    return Array.from(this.scenes.entries()).map(([name, scene]) => ({
      name,
      moduleCount: scene.modules.size,
    }));
  }
}
