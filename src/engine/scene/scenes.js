// Scene builder — constructs scenes from modular components
import { SceneNode, SceneRegistry, SceneManager } from './SceneGraph.js';
import * as THREE from 'three';
import createMountainModule from '../modules/Mountain.js';
import createTrainModule from '../modules/Train.js';
import createSkyModule from '../modules/Sky.js';
import createCrossingModule from '../modules/Crossing.js';
import createTunnelModule from '../modules/Tunnel.js';

export function buildMountainTrainScene(registry) {
  const root = new SceneNode('scene', { name: 'Mountain Train' });

  // Sky layer
  const sky = registry.createNode('sky', { radius: 150, starDensity: 5000 });
  root.addChild(sky);

  // Mountain terrain with tunnel
  const mountain = registry.createNode('mountain', {
    numPeaks: 3,
    width: 80,
    depth: 40,
    height: 22,
    hasTunnel: true,
    tunnelX: 8,
    tunnelZ: 0,
    tunnelRadius: 2.8,
    trees: true,
    treeCount: 70,
    grassCount: 25,
    seed: 42,
  });
  root.addChild(mountain);

  // Tunnel entrance
  const tunnel = registry.createNode('tunnel', {
    radius: 2.5,
    depth: 4,
    width: 6,
  });
  tunnel.position = [8, 0, 0];
  root.addChild(tunnel);

  // Train
  const train = registry.createNode('train', {
    numCars: 5,
    carLength: 3.5,
    carWidth: 1.1,
    carHeight: 1.2,
  });
  root.addChild(train);

  // Connection rules
  sky.connect(mountain, 'background', 1.0);
  mountain.connect(tunnel, 'terrain', 1.0);
  mountain.connect(train, 'terrain', 1.0);

  return {
    root,
    config: {
      camera: {
        startPos: [30, 14, 35],
        endPos: [10, 4, 12],
        startTarget: [5, 8, 0],
        endTarget: [8, 3, 0],
      }
    }
  };
}

export function buildTokyoCrossingScene(registry) {
  const root = new SceneNode('scene', { name: 'Tokyo Crossing' });

  const sky = registry.createNode('sky', { radius: 100, starDensity: 2000 });
  root.addChild(sky);

  const crossing = registry.createNode('crossing', {
    roadWidth: 35,
    roadDepth: 35,
    crowdCount: 45,
    rainCount: 3000,
    rainHeight: 18,
    rainSpread: 30,
  });
  root.addChild(crossing);

  sky.connect(crossing, 'atmosphere', 1.0);

  return {
    root,
    config: {
      camera: {
        startPos: [14, 9, 18],
        endPos: [8, 5, 10],
        startTarget: [0, 3, 0],
        endTarget: [0, 4, -2],
      }
    }
  };
}

export function createDefaultRegistry() {
  const registry = new SceneRegistry();

  registry.registerModule('scene', (params) => new THREE.Group(), { label: 'Scene Root', category: 'core' });
  registry.registerModule('sky', (params) => createSkyModule(params), { label: 'Sky', category: 'environment' });
  registry.registerModule('mountain', (params) => createMountainModule(params), { label: 'Mountain', category: 'terrain' });
  registry.registerModule('train', (params) => createTrainModule(params), { label: 'Train', category: 'vehicle' });
  registry.registerModule('crossing', (params) => createCrossingModule(params), { label: 'Crossing', category: 'environment' });
  registry.registerModule('tunnel', (params) => createTunnelModule(params), { label: 'Tunnel', category: 'structure' });

  // Connection rules
  registry.rules
    .addRule('scene', 'sky', ['*'], 1)
    .addRule('scene', 'mountain', ['*'], 3)
    .addRule('scene', 'train', ['*'], 2)
    .addRule('scene', 'crossing', ['*'], 2)
    .addRule('scene', 'tunnel', ['*'], 2)
    .addRule('mountain', 'train', ['terrain'], 2)
    .addRule('mountain', 'tunnel', ['terrain'], 2)
    .addRule('sky', 'mountain', ['background'], 1)
    .addRule('sky', 'crossing', ['atmosphere'], 1);

  return registry;
}

export function buildAllScenes(registry) {
  const manager = new SceneManager(registry);

  const mountainScene = buildMountainTrainScene(registry);
  manager.createScene('mountain-train', mountainScene.root);
  manager.scenes.get('mountain-train').config = mountainScene.config;

  const crossingScene = buildTokyoCrossingScene(registry);
  manager.createScene('tokyo-crossing', crossingScene.root);
  manager.scenes.get('tokyo-crossing').config = crossingScene.config;

  return manager;
}
