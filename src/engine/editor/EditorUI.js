// Editor UI - Scene tree, module palette, properties panel
export class EditorUI {
  constructor(engine) {
    this.engine = engine;
    this.selectedNodeId = null;

    this.treeEl = document.getElementById('scene-tree');
    this.paletteEl = document.getElementById('module-palette');
    this.propertiesEl = document.getElementById('properties-panel');
    this.connectionsEl = document.getElementById('connections-panel');
    this.sceneLabelEl = document.getElementById('scene-label');
    this.fpsEl = document.getElementById('fps-counter');
    this.moduleCountEl = document.getElementById('module-count');

    this._buildPalette();
    this._setupEventListeners();
    this.startUpdateLoop();
  }

  _buildPalette() {
    if (!this.paletteEl) return;
    this.paletteEl.innerHTML = '';

    const modules = this.engine.registry.getAllTypes();
    for (const type of modules) {
      if (type === 'scene') continue; // Skip root
      const info = this.engine.registry.getModuleInfo(type);
      const item = document.createElement('div');
      item.className = 'module-item';
      item.innerHTML = `<span class="type">${info?.meta?.category || 'module'}</span><br/>${info?.meta?.label || type}`;
      item.addEventListener('click', () => this._onModuleClick(type));
      this.paletteEl.appendChild(item);
    }
  }

  _setupEventListeners() {
    // Mode toggle
    const modeBtn = document.getElementById('mode-toggle');
    if (modeBtn) {
      modeBtn.addEventListener('click', () => {
        this.engine.toggleMode();
        if (this.engine.mode === 'edit') this.refresh();
      });
    }

    // Scene selector
    const sceneBtn = document.getElementById('scene-selector');
    if (sceneBtn) {
      sceneBtn.addEventListener('click', () => this._showSceneSelector());
    }

    // Audio toggle
    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) {
      audioBtn.addEventListener('click', async () => {
        if (!this.engine.audio.initialized) {
          await this.engine.initAudio();
        }
        const enabled = this.engine.audio.toggle();
        audioBtn.textContent = enabled ? '🔊 Audio' : '🔇 Audio';
      });
    }
  }

  refresh() {
    this._updateTree();
    this._updateProperties();
    this._updateConnections();
    this._updateLabels();
  }

  _updateLabels() {
    if (this.sceneLabelEl) {
      this.sceneLabelEl.textContent = this.engine.activeSceneName || 'No Scene';
    }
    if (this.fpsEl) {
      this.fpsEl.textContent = `${this.engine.fps} FPS`;
    }
    if (this.moduleCountEl) {
      this.moduleCountEl.textContent = `${this.engine.modules.length} modules`;
    }
  }

  _updateTree() {
    if (!this.treeEl) return;
    this.treeEl.innerHTML = '';

    const nodes = this.engine.getSceneTree();
    for (const node of nodes) {
      this._renderTreeNode(node, this.treeEl, 0);
    }
  }

  _renderTreeNode(node, container, depth) {
    const el = document.createElement('div');
    el.className = `tree-node ${this.selectedNodeId === node.id ? 'selected' : ''}`;
    el.style.paddingLeft = `${8 + depth * 12}px`;

    const dot = document.createElement('span');
    dot.className = 'dot';
    const colors = { sky: '#2a9a8a', mountain: '#faf8f5', train: '#c44030', crossing: '#2a9a8a' };
    dot.style.background = colors[node.type] || '#8a8480';
    el.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = `${node.type} #${node.id}`;
    el.appendChild(label);

    el.addEventListener('click', () => {
      this.selectedNodeId = node.id;
      this._updateTree();
      this._updateProperties();
    });

    container.appendChild(el);

    if (node.children.length > 0) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      for (const child of node.children) {
        this._renderTreeNode(child, childContainer, depth + 1);
      }
      container.appendChild(childContainer);
    }
  }

  _updateProperties() {
    if (!this.propertiesEl) return;
    this.propertiesEl.innerHTML = '';

    if (!this.selectedNodeId) {
      this.propertiesEl.innerHTML = '<p style="color:var(--text-dim);font-size:11px;">Select a node to edit properties</p>';
      return;
    }

    // Find the node
    const scene = this.engine.sceneManager.activeScene;
    if (!scene) return;

    const node = scene.modules.get(this.selectedNodeId);
    if (!node) return;

    // Show params
    for (const [key, value] of Object.entries(node.params)) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const label = document.createElement('label');
      label.textContent = key;
      const input = document.createElement('input');
      input.value = typeof value === 'number' ? value.toFixed(2) : value;

      input.addEventListener('change', (e) => {
        const newVal = isNaN(parseFloat(e.target.value)) ? e.target.value : parseFloat(e.target.value);
        node.params[key] = newVal;
        // Could trigger re-render here
      });

      row.appendChild(label);
      row.appendChild(input);
      this.propertiesEl.appendChild(row);
    }
  }

  _updateConnections() {
    if (!this.connectionsEl) return;
    this.connectionsEl.innerHTML = '';

    if (!this.selectedNodeId) return;

    const scene = this.engine.sceneManager.activeScene;
    if (!scene) return;

    const node = scene.modules.get(this.selectedNodeId);
    if (!node) return;

    // Show compatible types
    const options = this.engine.registry.getGrowthOptions(node);
    if (options.length === 0) {
      this.connectionsEl.innerHTML = '<p style="color:var(--text-dim);font-size:11px;">No compatible modules</p>';
      return;
    }

    for (const opt of options) {
      const item = document.createElement('div');
      item.className = 'connection-item';
      item.textContent = `+ ${opt.type} (${opt.meta.label || opt.meta.category})`;
      item.addEventListener('click', () => {
        this.engine.sceneManager.growScene(
          this.engine.activeSceneName,
          this.selectedNodeId,
          opt.type,
          {}
        );
        this.refresh();
      });
      this.connectionsEl.appendChild(item);
    }
  }

  _onModuleClick(type) {
    if (!this.selectedNodeId) {
      // Add to root of active scene
      const scene = this.engine.sceneManager.activeScene;
      if (scene) {
        this.engine.sceneManager.growScene(this.engine.activeSceneName, scene.root.id, type, {});
        this.refresh();
      }
    } else {
      const scene = this.engine.sceneManager.activeScene;
      if (scene) {
        this.engine.sceneManager.growScene(this.engine.activeSceneName, this.selectedNodeId, type, {});
        this.refresh();
      }
    }
  }

  _showSceneSelector() {
    const scenes = this.engine.sceneManager.getAllScenes();
    const current = this.engine.activeSceneName;

    // Simple overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(18,18,26,0.97);border:1px solid var(--border);border-radius:8px;padding:16px;z-index:200;min-width:200px;';

    for (const s of scenes) {
      const btn = document.createElement('div');
      btn.style.cssText = 'padding:8px 12px;margin:4px 0;font-family:var(--font-mono);font-size:12px;cursor:pointer;border-radius:4px;';
      btn.style.background = s.name === current ? 'var(--accent-dim)' : 'transparent';
      btn.style.color = s.name === current ? 'var(--white)' : 'var(--text-dim)';
      btn.textContent = s.name;
      btn.addEventListener('click', () => {
        this.engine.loadScene(s.name);
        overlay.remove();
        this.refresh();
      });
      overlay.appendChild(btn);
    }

    document.body.appendChild(overlay);
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!overlay.contains(e.target)) overlay.remove();
      }, { once: true });
    }, 0);
  }

  startUpdateLoop() {
    setInterval(() => {
      if (this.engine.mode === 'edit') {
        this.refresh();
      }
    }, 500);
  }
}

export default EditorUI;
