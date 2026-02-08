import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Entity, MeshComponent, PhysicsComponent } from './entity.js';
import { SphereController } from './scripts/SphereController.js';
// import { SkierController } from './scripts/SkierController.js';
import { SkierController2 } from './scripts/SkierController2.js';
import { AssetLoader } from './assets.js';

export class World {
  constructor(engine) {
    this.engine = engine;
    this.entities = [];
    this.physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
    this.physicsWorld.allowSleep = true;

    this.assets = new AssetLoader();

    this.sphereMat = new CANNON.Material('sphere');
    this.treeMat = new CANNON.Material('tree');
    this.rampMat = new CANNON.Material('ramp');
    this.skierMat = new CANNON.Material('skier');
    this.terrainMat = new CANNON.Material('terrain');

    this.terrain = {
      seed: 1337,
      chunkSize: 80,
      segments: 64,
      viewAhead: 2,
      viewBehind: 1,
      viewSide: 1,
      chunks: new Map(),
      slope: 0.24,
      mountainHeight: 70,
      heightOffset: 0,
      scatter: {
        trees: 8,
        ramps: 2,
        spheres: 6,
        minSpacing: {
          tree: 6,
          ramp: 10,
          sphere: 4,
        },
        maxSlopeDeg: {
          tree: 30,
          ramp: 18,
        },
      },
    };
  }

  addEntity(entity) {
    this.entities.push(entity);
  }

  removeEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index !== -1) this.entities.splice(index, 1);
  }

  init() {
    const scene = this.engine.scene;

    // Lights - cool, wintery tones
    scene.add(new THREE.AmbientLight(0xb0d8f0, 0.6));
    const dir = new THREE.DirectionalLight(0xf0f8ff, 1.2);
    dir.position.set(8, 16, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 150;
    dir.shadow.camera.left = -80;
    dir.shadow.camera.right = 80;
    dir.shadow.camera.top = 80;
    dir.shadow.camera.bottom = -80;
    dir.shadow.bias = -0.0003;
    scene.add(dir);

    // Contact material - snowballs have higher friction and lower bounce
    const contact = new CANNON.ContactMaterial(this.terrainMat, this.sphereMat, {
      friction: 0.8,
      restitution: 0.2,
    });
    this.physicsWorld.addContactMaterial(contact);

    // Snowball-to-snowball interactions
    const sphereContact = new CANNON.ContactMaterial(this.sphereMat, this.sphereMat, {
      friction: 0.7,
      restitution: 0.15,
    });
    this.physicsWorld.addContactMaterial(sphereContact);

    const skierTerrain = new CANNON.ContactMaterial(this.skierMat, this.terrainMat, {
      friction: 0.08,
      restitution: 0.1,
    });
    this.physicsWorld.addContactMaterial(skierTerrain);

    const skierRamp = new CANNON.ContactMaterial(this.skierMat, this.rampMat, {
      friction: 0.05,
      restitution: 0.1,
    });
    this.physicsWorld.addContactMaterial(skierRamp);

    this.initTerrain();
    this.engine.addPostUpdate(() => this.updateTerrain());

    this.addPlayer();
    this.engine.addPostUpdate((dt) => this.updateCameraFollow(dt));
  }

  addSphere(x = (Math.random() - 0.5) * 6, y = 12 + Math.random() * 6, z = (Math.random() - 0.5) * 6) {
    const r = 0.5 + Math.random() * 0.6;
    const geom = new THREE.SphereGeometry(r, 24, 24);

    // Snowballs: white base with slight variations and roughness
    const snowColor = new THREE.Color().setHSL(0.55, 0.15, 0.92 + Math.random() * 0.08);
    const mat = new THREE.MeshStandardMaterial({
      color: snowColor,
      roughness: 0.95,
      metalness: 0,
      emissive: new THREE.Color(0xf0f8ff),
      emissiveIntensity: 0.05,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;

    // Snowballs are slightly heavier due to compacted snow
    const body = new CANNON.Body({
      mass: r * 2.5,
      shape: new CANNON.Sphere(r),
      position: new CANNON.Vec3(x, y, z),
      material: this.sphereMat,
      linearDamping: 0.15,
      angularDamping: 0.3,
    });

    const entity = new Entity('snowball');
    entity.addComponent(new MeshComponent(mesh));
    entity.addComponent(new PhysicsComponent(body));
    entity.addScript(new SphereController());
    this.engine.addEntity(entity);
    return entity;
  }

  addTree(x = (Math.random() - 0.5) * 12, y = 0, z = (Math.random() - 0.5) * 12) {
    const group = this.assets.createTreeMesh();
    group.position.set(x, 0, z);

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.6, 0.6, 3.0, 8),
      position: new CANNON.Vec3(x, 1.5, z),
      material: this.treeMat,
    });

    const entity = new Entity('tree');
    entity.addComponent(new MeshComponent(group));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);
  }

  addRamp(x = (Math.random() - 0.5) * 10, y = 0.2, z = (Math.random() - 0.5) * 10) {
    const mesh = this.assets.createRampMesh();
    mesh.position.set(x, y, z);

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.2, 1.0)),
      position: new CANNON.Vec3(x, y, z),
      material: this.rampMat,
    });
    body.quaternion.setFromEuler(-Math.PI / 9, 0, 0);

    const entity = new Entity('ramp');
    entity.addComponent(new MeshComponent(mesh));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);
  }

  addSkier(x = (Math.random() - 0.5) * 8, y = 0.8, z = (Math.random() - 0.5) * 8) {
    const group = this.assets.createSkierMesh();
    group.position.set(x, y, z);

    const phys = new CANNON.Body({
      mass: 2,
      shape: new CANNON.Box(new CANNON.Vec3(0.4, 0.7, 0.4)),
      position: new CANNON.Vec3(x, y + 0.7, z),
      material: this.skierMat,
      linearDamping: 0.2,
      angularDamping: 0.4,
    });

    const entity = new Entity('skier');
    entity.addComponent(new MeshComponent(group));
    entity.addComponent(new PhysicsComponent(phys));
    this.engine.addEntity(entity);
  }

  addPlayer() {
    const group = this.assets.createSkierMesh();

    const radius = 0.35;
    const height = 1.2;
    const startX = 0;
    const startZ = 0;
    const groundY = this.getHeight(startX, startZ);
    const startY = groundY + height + radius + 0.6;
    group.position.set(startX, startY, startZ);

    const cyl = new CANNON.Cylinder(radius, radius, height, 8);
    const sphereTop = new CANNON.Sphere(radius);
    const sphereBottom = new CANNON.Sphere(radius);

    const body = new CANNON.Body({
      mass: 4,
      material: this.skierMat,
      position: new CANNON.Vec3(startX, startY, startZ),
      linearDamping: 0.001,
      angularDamping: 0.5,
      fixedRotation: false,
      angularFactor: new CANNON.Vec3(0, 1, 0),
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
    });
    body.quaternion.setFromEuler(0, Math.PI, 0);
    body.addShape(cyl);
    body.addShape(sphereTop, new CANNON.Vec3(0, height / 2, 0));
    body.addShape(sphereBottom, new CANNON.Vec3(0, -height / 2, 0));
    body.userData = { footOffset: height / 2 + radius };

    const entity = new Entity('player');
    entity.addComponent(new MeshComponent(group));
    entity.addComponent(new PhysicsComponent(body));
    entity.addScript(new SkierController2(this));
    this.engine.addEntity(entity);
    this.player = entity;
  }

  async addTreeModel(url, position = { x: 0, y: 0, z: 0 }) {
    const model = await this.assets.loadGLTF(url);
    if (!model) return;
    model.position.set(position.x, position.y, position.z);
    model.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.6, 0.6, 3.0, 8),
      position: new CANNON.Vec3(position.x, position.y + 1.5, position.z),
      material: this.treeMat,
    });

    const entity = new Entity('tree');
    entity.addComponent(new MeshComponent(model));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);
  }

  initTerrain() {
    this.terrain.chunks.clear();
    this.updateTerrain(true);
  }

  updateTerrain(force = false) {
    const focusZ = this.engine.camera?.position?.z ?? 0;
    const baseZ = Math.floor(focusZ / this.terrain.chunkSize);
    const baseX = Math.floor((this.engine.camera?.position?.x ?? 0) / this.terrain.chunkSize);
    const minZ = baseZ - this.terrain.viewBehind;
    const maxZ = baseZ + this.terrain.viewAhead;
    const minX = baseX - this.terrain.viewSide;
    const maxX = baseX + this.terrain.viewSide;

    for (let zi = minZ; zi <= maxZ; zi++) {
      for (let xi = minX; xi <= maxX; xi++) {
        const key = `${xi},${zi}`;
        if (!this.terrain.chunks.has(key)) this.createTerrainChunk(xi, zi);
      }
    }

    if (!force) {
      for (const [key, chunk] of this.terrain.chunks) {
        const [xiStr, ziStr] = key.split(',');
        const xi = Number(xiStr);
        const zi = Number(ziStr);
        if (xi < minX || xi > maxX || zi < minZ || zi > maxZ) {
          this.engine.removeEntity(chunk.entity);
          if (chunk.scatterEntities) {
            for (const e of chunk.scatterEntities) this.engine.removeEntity(e);
          }
          this.terrain.chunks.delete(key);
        }
      }
    }
  }

  createTerrainChunk(xIndex, zIndex) {
    const { chunkSize, segments } = this.terrain;
    const width = chunkSize;
    const depth = chunkSize;
    const centerX = (xIndex + 0.5) * chunkSize;
    const centerZ = (zIndex + 0.5) * chunkSize;
    const startX = centerX - width / 2;
    const startZ = centerZ - depth / 2;

    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const localX = positions.getX(i);
      const localZ = positions.getZ(i);
      const worldX = localX + centerX;
      const worldZ = localZ + centerZ;
      const height = this.getHeight(worldX, worldZ);
      positions.setY(i, height);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f9fc, roughness: 0.9, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(centerX, 0, centerZ);
    mesh.receiveShadow = true;

    const vertices = Array.from(positions.array);
    const indexArray = geometry.index ? Array.from(geometry.index.array) : null;
    const indices = indexArray || Array.from({ length: vertices.length / 3 }, (_, i) => i);

    const shape = new CANNON.Trimesh(vertices, indices);
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.terrainMat,
    });
    body.addShape(shape);
    body.position.set(centerX, this.terrain.heightOffset, centerZ);

    const entity = new Entity(`terrain-${xIndex}-${zIndex}`);
    entity.addComponent(new MeshComponent(mesh));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);

    const scatterEntities = this.scatterTerrainEntities(centerX, centerZ, width, depth);

    this.terrain.chunks.set(`${xIndex},${zIndex}`, { entity, body, mesh, scatterEntities });
  }

  scatterTerrainEntities(centerX, centerZ, width, depth) {
    const scatter = this.terrain.scatter;
    const created = [];
    const placed = [];

    this.tryScatter(scatter.trees, 20, (pos) => {
      if (!this.isSlopeOk(pos.x, pos.z, scatter.maxSlopeDeg.tree)) return null;
      return {
        x: pos.x,
        z: pos.z,
        min: scatter.minSpacing.tree,
        place: () => this.addTreeAt(pos.x, this.getHeight(pos.x, pos.z), pos.z),
      };
    }, placed, created, centerX, centerZ, width, depth);

    this.tryScatter(scatter.ramps, 30, (pos) => {
      if (!this.isSlopeOk(pos.x, pos.z, scatter.maxSlopeDeg.ramp)) return null;
      return {
        x: pos.x,
        z: pos.z,
        min: scatter.minSpacing.ramp,
        place: () => this.addRampAt(pos.x, this.getHeight(pos.x, pos.z) + 0.05, pos.z),
      };
    }, placed, created, centerX, centerZ, width, depth);

    this.tryScatter(scatter.spheres, 20, (pos) => {
      return {
        x: pos.x,
        z: pos.z,
        min: scatter.minSpacing.sphere,
        place: () => this.addSphere(pos.x, this.getHeight(pos.x, pos.z) + 1.2, pos.z),
      };
    }, placed, created, centerX, centerZ, width, depth);

    return created;
  }

  tryScatter(count, maxAttempts, planFn, placed, created, centerX, centerZ, width, depth) {
    let added = 0;
    let attempts = 0;
    while (added < count && attempts < count * maxAttempts) {
      attempts += 1;
      const pos = this.randomPointInChunk(centerX, centerZ, width, depth);
      const plan = planFn(pos);
      if (!plan) continue;
      if (!this.isFarEnough(plan, placed)) continue;
      const entity = plan.place();
      placed.push({ x: plan.x, z: plan.z, min: plan.min });
      created.push(entity);
      added += 1;
    }
  }

  isFarEnough(pos, placed) {
    for (const other of placed) {
      const dx = pos.x - other.x;
      const dz = pos.z - other.z;
      const dist = Math.hypot(dx, dz);
      const min = Math.max(pos.min, other.min);
      if (dist < min) return false;
    }
    return true;
  }

  isSlopeOk(x, z, maxSlopeDeg) {
    const normal = this.getNormal(x, z);
    const slopeDeg = Math.acos(Math.max(-1, Math.min(1, normal.y))) * (180 / Math.PI);
    return slopeDeg <= maxSlopeDeg;
  }

  randomPointInChunk(centerX, centerZ, width, depth) {
    const x = centerX + (Math.random() - 0.5) * width;
    const z = centerZ + (Math.random() - 0.5) * depth;
    return { x, z };
  }

  getNormal(x, z) {
    const eps = 0.35;
    const hL = this.getHeight(x - eps, z);
    const hR = this.getHeight(x + eps, z);
    const hD = this.getHeight(x, z - eps);
    const hU = this.getHeight(x, z + eps);
    const nx = hL - hR;
    const ny = 2 * eps;
    const nz = hD - hU;
    return new THREE.Vector3(nx, ny, nz).normalize();
  }

  addTreeAt(x, y, z) {
    const group = this.assets.createTreeMesh();
    group.position.set(x, y, z);

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.6, 0.6, 3.0, 8),
      position: new CANNON.Vec3(x, y + 1.5, z),
      material: this.treeMat,
    });

    const entity = new Entity('tree');
    entity.addComponent(new MeshComponent(group));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);
    return entity;
  }

  addRampAt(x, y, z) {
    const mesh = this.assets.createRampMesh();
    mesh.position.set(x, y, z);

    const normal = this.getNormal(x, z);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    mesh.quaternion.copy(quat);

    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.2, 1.0)),
      position: new CANNON.Vec3(x, y, z),
      material: this.rampMat,
    });
    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);

    const entity = new Entity('ramp');
    entity.addComponent(new MeshComponent(mesh));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);
    return entity;
  }


  updateCameraFollow(dt) {
    if (!this.player || !this.engine?.camera) return;
    const body = this.player.getComponent('physics').body;
    const cam = this.engine.camera;
    const headingQuat = this.player.getComponent('mesh').mesh.quaternion;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(headingQuat).normalize();
    const desired = new THREE.Vector3(
      body.position.x - forward.x * 8,
      body.position.y + 4,
      body.position.z - forward.z * 8,
    );

    cam.position.lerp(desired, Math.min(1, dt * 3));
    if (this.engine.controls) {
      this.engine.controls.target.set(body.position.x, body.position.y + 1.2, body.position.z);
    } else {
      cam.lookAt(body.position.x, body.position.y + 1.2, body.position.z);
    }
  }

  getHeight(x, z) {
    const { slope, mountainHeight } = this.terrain;
    const baseSlope = z * slope;

    const ridge = 1 - Math.abs(this.fbm(x * 0.014, z * 0.014, 5) * 2 - 1);
    const detail = this.fbm(x * 0.07, z * 0.07, 4);

    return baseSlope + ridge * mountainHeight + detail * 12.0;
  }

  fbm(x, z, octaves = 4) {
    let value = 0;
    let amp = 1;
    let freq = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.valueNoise(x * freq, z * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return value / max;
  }

  valueNoise(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const xf = x - x0;
    const zf = z - z0;

    const v00 = this.hash2(x0, z0);
    const v10 = this.hash2(x0 + 1, z0);
    const v01 = this.hash2(x0, z0 + 1);
    const v11 = this.hash2(x0 + 1, z0 + 1);

    const u = xf * xf * (3 - 2 * xf);
    const v = zf * zf * (3 - 2 * zf);

    const x1 = v00 * (1 - u) + v10 * u;
    const x2 = v01 * (1 - u) + v11 * u;
    return x1 * (1 - v) + x2 * v;
  }

  hash2(x, z) {
    let h = x * 374761393 + z * 668265263 + this.terrain.seed * 144;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h >>> 0) / 4294967295;
  }
}
