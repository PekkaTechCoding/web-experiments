import * as THREE from 'three';

export class SnowParticles {
  constructor({
    scene,
    maxParticles = 1200,
    size = 0.08,
    life = 0.9,
    gravity = -5,
  } = {}) {
    this.maxParticles = maxParticles;
    this.life = life;
    this.gravity = gravity;

    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = new Float32Array(maxParticles * 3);
    this.lifetimes = new Float32Array(maxParticles);
    this.nextIndex = 0;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('life', new THREE.BufferAttribute(this.lifetimes, 1));

    this.material = new THREE.PointsMaterial({
      color: 0xffffff,
      size,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    if (scene) scene.add(this.points);
  }

  emit(position, direction, speed = 2.5, spread = 0.6, count = 4) {
    const dir = direction?.clone().normalize() || new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const idx = this.nextIndex;
      this.nextIndex = (this.nextIndex + 1) % this.maxParticles;

      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.6,
        (Math.random() - 0.5) * spread,
      );
      const vel = dir.clone().multiplyScalar(speed).add(jitter);

      this.positions[idx * 3 + 0] = position.x;
      this.positions[idx * 3 + 1] = position.y;
      this.positions[idx * 3 + 2] = position.z;

      this.velocities[idx * 3 + 0] = vel.x;
      this.velocities[idx * 3 + 1] = vel.y;
      this.velocities[idx * 3 + 2] = vel.z;

      this.lifetimes[idx] = this.life;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.life.needsUpdate = true;
  }

  update(dt) {
    const count = this.maxParticles;
    for (let i = 0; i < count; i++) {
      if (this.lifetimes[i] <= 0) continue;
      this.lifetimes[i] -= dt;
      if (this.lifetimes[i] <= 0) continue;

      const vx = this.velocities[i * 3 + 0];
      const vy = this.velocities[i * 3 + 1] + this.gravity * dt;
      const vz = this.velocities[i * 3 + 2];

      this.velocities[i * 3 + 1] = vy;

      this.positions[i * 3 + 0] += vx * dt;
      this.positions[i * 3 + 1] += vy * dt;
      this.positions[i * 3 + 2] += vz * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.life.needsUpdate = true;
  }
}
