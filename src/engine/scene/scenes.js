// Scene builder - constructs predefined scenes from modules
import { SceneNode, SceneRegistry, SceneManager } from './SceneGraph.js';
import createMountainModule from '../modules/Mountain.js';
import createTrainModule from '../modules/Train.js';
import createSkyModule from '../modules/Sky.js';
import createCrossingModule from '../modules/Crossing.js';

export function buildMountainTrainScene(registry) {
  const root = new SceneNode('scene', { name: 'Mountain Train' });

  // Sky layer
  const sky = registry.createNode('sky', { radius: 120 });
  root.addChild(sky);

  // Mountain terrain with tunnel
  const mountain = registry.createNode('mountain', {
    numPeaks: 3,
    width: 70,
    depth: 40,
    height: 18,
    hasTunnel: true,
    tunnelX: 8,
    tunnelZ: 0,
    tunnelRadius: 2.5,
    trees: true,
    treeCount: 50,
  });
  root.addChild(mountain);

  // Train
  const train = registry.createNode('train', {
    numCars: 4,
    carLength: 4.5,
  });
  root.addChild(train);

  // Snow ground (part of mountain module)

  // Set connection rules
  sky.connect(mountain, 'background', 1.0);
  mountain.connect(train, 'terrain', 1.0);

  return { root, config: { camera: { pos: [25, 12, 30], target: [5, 5, 0] } } };
}

export function buildTokyoCrossingScene(registry) {
  const root = new SceneNode('scene', { name: 'Tokyo Crossing' });

  const sky = registry.createNode('sky', { radius: 80, starDensity: 1000 });
  root.addChild(sky);

  const crossing = registry.createNode('crossing', {
    roadWidth: 30,
    roadDepth: 30,
    crowdCount: 35,
    rainCount: 2500,
    rainHeight: 15,
    rainSpread: 25,
  });
  root.addChild(crossing);

  sky.connect(crossing, 'atmosphere', 1.0);

  return { root, config: { camera: { pos: [12, 8, 15], target: [0, 2, 0] } } };
}

export function createDefaultRegistry() {
  const registry = new SceneRegistry();

  registry.registerModule('scene', (params) => new THREE.Group(), { label: 'Scene Root', category: 'core' });
  registry.registerModule('sky', (params) => createSkyModule(params), { label: 'Sky', category: 'environment' });
  registry.registerModule('mountain', (params) => createMountainModule(params), { label: 'Mountain', category: 'terrain' });
  registry.registerModule('train', (params) => createTrainModule(params), { label: 'Train', category: 'vehicle' });
  registry.registerModule('crossing', (params) => createCrossingModule(params), { label: 'Crossing', category: 'environment' });

  // Connection rules
  registry.rules
    .addRule('scene', 'sky', ['*'], 1)
    .addRule('scene', 'mountain', ['*'], 3)
    .addRule('scene', 'train', ['*'], 2)
    .addRule('scene', 'crossing', ['*'], 2)
    .addRule('mountain', 'train', ['terrain'], 2)
    .addRule('sky', 'mountain', ['background'], 1)
    .addRule('sky', 'crossing', ['atmosphere'], 1);

  return registry;
}

export function buildAllScenes(registry) {
  const manager = new SceneManager(registry);

  const mountainScene = buildMountainTrainScene(registry);
  manager.createScene('mountain-train', mountainScene.root);

  const crossingScene = buildTokyoCrossingScene(registry);
  manager.createScene('tokyo-crossing', crossingScene.root);

  return manager;
}
