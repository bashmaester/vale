// Vale - Procedural World Kit
// Main entry point
import * as THREE from 'three';
// Make THREE available globally for shader modules
window.THREE = THREE;

import { Engine } from './engine/Engine.js';
import { EditorUI } from './engine/editor/EditorUI.js';

const container = document.getElementById('canvas-container');
const engine = new Engine(container);
const editor = new EditorUI(engine);

// Initialize audio on first interaction
let audioReady = false;
const initAudio = async () => {
  if (!audioReady) {
    await engine.initAudio();
    audioReady = true;
  }
  await engine.audio.resume();
};

document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });

// Transition overlay
const overlay = document.createElement('div');
overlay.id = 'transition-overlay';
overlay.className = 'fade-out';
document.body.appendChild(overlay);
setTimeout(() => overlay.remove(), 1000);

// Start
engine.start();

console.log('%c Vale World Kit ', 'background:#c44030;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px;');
console.log('Press "Edit Mode" to open the scene editor');
