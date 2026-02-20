import * as THREE from 'three';

export class SnowParticles {
  constructor({
    scene,
    maxParticles = 1200,
    size = 0.16,
    life = 3.0,
    gravity = -7,
    growFactor = 3.0,
  } = {}) {
    this.maxParticles = maxParticles;
    this.life = life;
    this.gravity = gravity;
    this.baseSize = size;
    this.growFactor = growFactor;
    this.baseColor = new THREE.Color(0xf5f9fc);
    this.endColor = new THREE.Color(0x8a8f94);
    this.baseAlpha = 0.85;
    this.endAlpha = 0.35;

    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = new Float32Array(maxParticles * 3);
    this.lifetimes = new Float32Array(maxParticles);
    this.sizes = new Float32Array(maxParticles);
    this.colors = new Float32Array(maxParticles * 3);
    this.alphas = new Float32Array(maxParticles);
    this.nextIndex = 0;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('life', new THREE.BufferAttribute(this.lifetimes, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        sizeScale: { value: 300.0 },
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float sizeScale;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (sizeScale / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = dot(c, c);
          float mask = smoothstep(0.25, 0.0, d);
          gl_FragColor = vec4(vColor, vAlpha * mask);
        }
      `,
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
      this.sizes[idx] = this.baseSize;
      this.colors[idx * 3 + 0] = this.baseColor.r;
      this.colors[idx * 3 + 1] = this.baseColor.g;
      this.colors[idx * 3 + 2] = this.baseColor.b;
      this.alphas[idx] = this.baseAlpha;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.life.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  update(dt) {
    const count = this.maxParticles;
    for (let i = 0; i < count; i++) {
      if (this.lifetimes[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      this.lifetimes[i] -= dt;
      if (this.lifetimes[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }

      const t = 1 - (this.lifetimes[i] / this.life);
      const size = this.baseSize * (1 + t * this.growFactor);
      this.sizes[i] = size;
      this.alphas[i] = this.baseAlpha + (this.endAlpha - this.baseAlpha) * t;
      this.colors[i * 3 + 0] = this.baseColor.r + (this.endColor.r - this.baseColor.r) * t;
      this.colors[i * 3 + 1] = this.baseColor.g + (this.endColor.g - this.baseColor.g) * t;
      this.colors[i * 3 + 2] = this.baseColor.b + (this.endColor.b - this.baseColor.b) * t;

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
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}
