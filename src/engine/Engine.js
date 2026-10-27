// Core Engine — Three.js renderer, scene management, cinematic camera rig
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { grainFragmentShader, grainVertexShader } from './shaders/grain.js';
import { CameraRig } from './scene/CameraRig.js';
import { createDefaultRegistry, buildAllScenes } from './scene/scenes.js';
import { AudioEngine } from './audio/AudioEngine.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.mode = 'live';
    this.time = 0;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTime = 0;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x06060e);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.sceneGroup = new THREE.Group();
    this.scene.add(this.sceneGroup);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(35, 16, 40);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 10, 0);
    this.controls.minDistance = 2;
    this.controls.maxDistance = 100;

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.grainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uGrain: { value: 0.035 },
        uTime: { value: 0 },
        uContrast: { value: 1.15 },
        uVignette: { value: 1.3 },
        uTint: { value: new THREE.Color(1.0, 0.97, 0.94) },
        uScanline: { value: 0.15 },
      },
      vertexShader: grainVertexShader,
      fragmentShader: grainFragmentShader,
    });
    this.composer.addPass(this.grainPass);

    // Registry & scenes
    this.registry = createDefaultRegistry();
    this.sceneManager = buildAllScenes(this.registry);

    // Audio
    this.audio = new AudioEngine();

    // State
    this.activeSceneName = null;
    this.modules = [];
    this.cameraRig = null;

    // Bind
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    // Load first scene
    this.loadScene('mountain-train');
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  loadScene(name) {
    // Clear current
    while (this.sceneGroup.children.length > 0) {
      const child = this.sceneGroup.children[0];
      this.sceneGroup.remove(child);
      if (child.traverse) {
        child.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
      }
    }

    const scene = this.sceneManager.setActiveScene(name);
    this.activeSceneName = name;
    this.modules = [];
    this.time = 0;

    // Instantiate modules using registry
    const instantiate = (node, parentGroup) => {
      const modInfo = this.registry.modules.get(node.type);
      let mesh;
      if (modInfo) {
        mesh = modInfo.factory(node.params || {});
      } else {
        mesh = new THREE.Group();
      }

      mesh.position.set(...node.position);
      mesh.rotation.set(...node.rotation);
      mesh.scale.set(...node.scale);
      mesh.userData.sceneNode = node;
      parentGroup.add(mesh);
      this.modules.push(mesh);

      for (const child of node.children) {
        instantiate(child, mesh);
      }
    };

    const root = scene.root;
    for (const child of root.children) {
      instantiate(child, this.sceneGroup);
    }

    // Setup camera rig for this scene
    this._setupCameraRig(name);

    // Initialize audio
    this._setupAudioForScene(name);

    return scene;
  }

  _setupCameraRig(name) {
    switch (name) {
      case 'mountain-train':
        this.cameraRig = CameraRig.mountainTrainSequence();
        break;
      case 'tokyo-crossing':
        this.cameraRig = CameraRig.tokyoCrossingSequence();
        break;
      default:
        this.cameraRig = null;
    }
  }

  _setupAudioForScene(name) {
    if (!this.audio.initialized) return;
    switch (name) {
      case 'mountain-train':
        if (!this.audio.nodes.has('ambient')) this.audio.createAmbient({ frequency: 80, type: 'sine' });
        if (!this.audio.nodes.has('train')) this.audio.createTrainRumble();
        if (!this.audio.nodes.has('wind')) this.audio.createWind();
        break;
      case 'tokyo-crossing':
        if (!this.audio.nodes.has('ambient')) this.audio.createAmbient({ frequency: 150, type: 'triangle', cutoff: 600 });
        if (!this.audio.nodes.has('rain')) this.audio.createRain(0.6);
        break;
    }
  }

  toggleMode() {
    this.mode = this.mode === 'live' ? 'edit' : 'live';
    document.body.className = `mode-${this.mode}`;
    const btn = document.getElementById('mode-toggle');
    if (btn) btn.textContent = this.mode === 'live' ? 'Live View' : 'Edit Mode';
    this.controls.enabled = this.mode === 'live';
  }

  update(delta) {
    this.time += delta;
    this.controls.update();

    // Update all modules (includes tunnel interior, smoke, spray, etc.)
    for (const mod of this.modules) {
      if (mod.userData?.update) {
        mod.userData.update(this.time, delta);
      }
      // Also check children deeply for tunnel interior etc.
      mod.traverse(child => {
        if (child.userData?.update && child !== mod) {
          child.userData.update(this.time, delta);
        }
      });
    }

    // Post-processing
    this.grainPass.uniforms.uTime.value = this.time;

    // Camera rig in live mode
    if (this.mode === 'live' && this.cameraRig) {
      this.cameraRig.update(this.camera, this.controls, delta);

      // Audio state for mountain-train
      if (this.activeSceneName === 'mountain-train') {
        // Map camera proximity to train
        const dist = this.camera.position.distanceTo(new THREE.Vector3(8, 3, 0));
        const proximity = 1 - Math.min(dist / 30, 1);
        this.audio.updateFromState({
          trainProximity: proximity,
          windLevel: 0.2 + proximity * 0.6,
          ambientLevel: 0.4,
        });
      }

      if (this.activeSceneName === 'tokyo-crossing') {
        this.audio.updateFromState({
          rainIntensity: 0.8,
          ambientLevel: 0.3,
        });
      }
    }

    // FPS counter
    this.frameCount++;
    this.fpsTime += delta;
    if (this.fpsTime >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = 0;
    }
  }

  render() {
    this.composer.render();
  }

  animate() {
    const delta = this.clock.getDelta();
    this.update(delta);
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  start() {
    this.animate();
  }

  getSceneTree() {
    if (!this.activeSceneName) return [];
    const scene = this.sceneManager.scenes.get(this.activeSceneName);
    return scene?.root?.children || [];
  }

  async initAudio() {
    await this.audio.init();
  }
}

export default Engine;
