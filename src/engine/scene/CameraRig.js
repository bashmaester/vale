import * as THREE from 'three';

// Camera rig for dramatic cinematic sequences
export class CameraRig {
  constructor() {
    this.keyframes = [];
    this.time = 0;
    this.duration = 0;
    this.loop = true;
  }

  // Define a shot: position, target, fov, duration
  addShot(position, target, fov, duration, ease = 'smooth') {
    this.keyframes.push({
      position: new THREE.Vector3(...position),
      target: new THREE.Vector3(...target),
      fov,
      duration,
      ease,
    });
    this.duration += duration;
    return this;
  }

  // Build mountain-train sequence: far → close pass → tunnel
  static mountainTrainSequence() {
    const rig = new CameraRig();
    rig.duration = 25;

    // Shot 1: Wide establishing (0-5s)
    rig.addShot([35, 16, 40], [0, 10, 0], 50, 5, 'smooth');

    // Shot 2: Dolly in toward mountain (5-10s)
    rig.addShot([18, 8, 20], [5, 6, 0], 45, 5, 'accel');

    // Shot 3: Close wheel detail pass (10-15s) — dramatic scale change
    rig.addShot([3, 1.5, 6], [0, 0.5, 0], 70, 5, 'smooth');

    // Shot 4: Pull back, train entering tunnel (15-20s)
    rig.addShot([12, 5, 15], [8, 3, 0], 55, 5, 'decel');

    // Shot 5: Tunnel entrance, train disappearing (20-25s)
    rig.addShot([15, 4, 8], [8, 2.5, 0], 50, 5, 'smooth');

    return rig;
  }

  // Build tokyo-crossing sequence
  static tokyoCrossingSequence() {
    const rig = new CameraRig();
    rig.duration = 20;

    // Shot 1: High angle overview (0-4s)
    rig.addShot([16, 12, 20], [0, 2, 0], 50, 4, 'smooth');

    // Shot 2: Street level, crowd waiting (4-8s)
    rig.addShot([6, 3, 8], [0, 1.5, 0], 55, 4, 'smooth');

    // Shot 3: Crossing surge, diagonal (8-12s)
    rig.addShot([4, 2.5, 5], [-2, 1, -2], 60, 4, 'accel');

    // Shot 4: Overhead train passes (12-16s)
    rig.addShot([2, 8, 0], [0, 9, -12], 50, 4, 'smooth');

    // Shot 5: Pull back to overview (16-20s)
    rig.addShot([14, 10, 18], [0, 3, 0], 48, 4, 'decel');

    return rig;
  }

  update(camera, controls, deltaTime) {
    if (this.keyframes.length === 0) return;

    this.time = (this.time + deltaTime) % this.duration;

    // Find current shot
    let elapsed = 0;
    let currentShot = 0;
    for (let i = 0; i < this.keyframes.length; i++) {
      if (this.time < elapsed + this.keyframes[i].duration) {
        currentShot = i;
        break;
      }
      elapsed += this.keyframes[i].duration;
    }

    const shot = this.keyframes[currentShot];
    const nextShot = this.keyframes[(currentShot + 1) % this.keyframes.length];
    const shotElapsed = this.time - elapsed;
    const shotProgress = Math.min(shotElapsed / shot.duration, 1);

    // Easing
    let t = shotProgress;
    if (shot.ease === 'smooth') {
      t = shotProgress * shotProgress * (3 - 2 * shotProgress);
    } else if (shot.ease === 'accel') {
      t = shotProgress * shotProgress;
    } else if (shot.ease === 'decel') {
      t = 1 - (1 - shotProgress) * (1 - shotProgress);
    }

    // Interpolate position, target, fov
    const pos = shot.position.clone().lerp(nextShot.position, t);
    const target = shot.target.clone().lerp(nextShot.target, t);
    const fov = shot.fov + (nextShot.fov - shot.fov) * t;

    // Smooth camera movement
    camera.position.lerp(pos, 0.03);
    controls.target.lerp(target, 0.03);
    camera.fov += (fov - camera.fov) * 0.05;
    camera.updateProjectionMatrix();
  }
}
