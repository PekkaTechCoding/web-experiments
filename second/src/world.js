import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Entity, MeshComponent, PhysicsComponent } from './entity.js';
import { SphereController } from './scripts/SphereController.js';
import { SkierController2 } from './scripts/SkierController2.js';
import { TrailSystem } from './trail-system.js';
import { AssetLoader } from './assets.js';
import { SnowParticles } from './snow-particles.js';

export class World {
  constructor(engine, {
    enableTrails = true,
    enableTerrainMeshDeform = true,
    enableSnowParticles = true,
  } = {}) {
    this.engine = engine;
    this.entities = [];
    this.physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
    this.physicsWorld.allowSleep = true;

    this.assets = new AssetLoader();
    this.trails = enableTrails ? new TrailSystem() : null;
    this.enableTerrainMeshDeform = enableTerrainMeshDeform;
    this.snowParticles = enableSnowParticles ? new SnowParticles({ scene: this.engine.scene }) : null;
    this.terrainVisible = true;
    this.cameraFollowEnabled = true;
    
    this.sphereMat = new CANNON.Material('sphere');
    this.treeMat = new CANNON.Material('tree');
    this.rampMat = new CANNON.Material('ramp');
    this.skierMat = new CANNON.Material('skier');
    this.terrainMat = new CANNON.Material('terrain');

    this.terrain = {
      seed: 1337,
      chunkSize: 40,
      chunks: new Map(),
      slope: 0.24,
      mountainHeight: 70,
      heightOffset: 0,
      renderOffset: 0.4,
      lod: {
        highSegments: 64,
        lowSegments: 24,
        highRadiusX: 1,
        highRadiusZ: 1,
        lowExtraX: 1,
        lowExtraZ: 1,
        lowExtraForwardZ: 1,
      },
      valleyWidthChunks: 3,
      valleyDepth: 120,
      deform: {
        radius: 0.65,
        maxDepth: 1,//0.18,
      },
      scatter: {
        trees: 4,
        ramps: 1,
        spheres: 3,
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
    this.sunLight = dir;
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
    scene.add(dir.target);

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

    const skierObstacles = new CANNON.ContactMaterial(this.treeMat, this.rampMat, {
      friction: 0.05,
      restitution: 0.1,
    });
    this.physicsWorld.addContactMaterial(skierObstacles);

    this.initTerrain();
    this.engine.addPostUpdate(() => this.updateTerrain());

    this.addPlayer();
    this.engine.addPostUpdate((dt) => this.updateCameraFollow(dt));
    this.engine.addPostUpdate((dt) => {
      if (this.player && this.trails) {
        const body = this.player.getComponent(PhysicsComponent.type).body;
        this.trails.updateOrigin(body.position.x, body.position.z);
        this.trails.updateUniforms();
      }
      if (this.snowParticles) {
        this.snowParticles.update(dt);
      }
      if (this.sunLight && this.player) {
        const body = this.player.getComponent(PhysicsComponent.type).body;
        const targetX = body.position.x;
        const targetZ = body.position.z;
        const groundY = this.getHeight(targetX, targetZ);
        const lightOffset = new THREE.Vector3(8, 24, 6);
        this.sunLight.position.set(targetX + lightOffset.x, groundY + lightOffset.y, targetZ + lightOffset.z);
        this.sunLight.target.position.set(targetX, groundY, targetZ);
        this.sunLight.target.updateMatrixWorld();
        this.sunLight.shadow.camera.updateProjectionMatrix();
      }
    });
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

  addNPCSkier(x = (Math.random() - 0.5) * 8, y = 0.8, z = (Math.random() - 0.5) * 8) {
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
      angularFactor: new CANNON.Vec3(0, 0, 0),
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
    });
    body.addShape(cyl, new CANNON.Vec3(0, 0, 0));
    body.addShape(sphereTop, new CANNON.Vec3(0, height / 2, 0));
    body.addShape(sphereBottom, new CANNON.Vec3(0, -height / 2, 0));
    body.userData = { footOffset: height / 2 + radius };

    const entity = new Entity('player');
    entity.addComponent(new MeshComponent(group));
    entity.addComponent(new PhysicsComponent(body));
    entity.addScript(new SkierController2(this));
    this.engine.addEntity(entity);
    this.player = entity;
    if (this.trails) {
      this.trails.updateOrigin(startX, startZ);
      this.trails.updateUniforms();
    }
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
    this.updateTerrain();
  }

  updateTerrain() {
    const focusPos = this.player
      ? this.player.getComponent(PhysicsComponent.type).body.position
      : this.engine.camera?.position;
    const focusX = focusPos?.x ?? 0;
    const focusZ = focusPos?.z ?? 0;
    const { xi: baseX, zi: baseZ } = this.getChunkIndices(focusX, focusZ);
    const desired = this.getDesiredChunkLods(baseX, baseZ);

    for (const [key, lodLevel] of desired) {
      const [xiStr, ziStr] = key.split(',');
      const xi = Number(xiStr);
      const zi = Number(ziStr);
      const existing = this.terrain.chunks.get(key);
      if (!existing) {
        this.createTerrainChunk(xi, zi, lodLevel);
        continue;
      }
      if (existing.lodLevel !== lodLevel) {
        this.removeTerrainChunk(key, existing);
        this.createTerrainChunk(xi, zi, lodLevel);
      }
    }

    for (const [key, chunk] of this.terrain.chunks) {
      if (desired.has(key)) continue;
      this.removeTerrainChunk(key, chunk);
    }
  }

  getDesiredChunkLods(baseX, baseZ) {
    const desired = new Map();
    const lod = this.terrain.lod;
    const highMinX = baseX - lod.highRadiusX;
    const highMaxX = baseX + lod.highRadiusX;
    const highMinZ = baseZ - lod.highRadiusZ;
    const highMaxZ = baseZ + lod.highRadiusZ;
    const lowMinX = highMinX - lod.lowExtraX;
    const lowMaxX = highMaxX + lod.lowExtraX;
    const lowMinZ = highMinZ - lod.lowExtraZ - lod.lowExtraForwardZ;
    const lowMaxZ = highMaxZ + lod.lowExtraZ;

    for (let zi = lowMinZ; zi <= lowMaxZ; zi++) {
      for (let xi = lowMinX; xi <= lowMaxX; xi++) {
        const inHigh = (
          xi >= highMinX
          && xi <= highMaxX
          && zi >= highMinZ
          && zi <= highMaxZ
        );
        desired.set(`${xi},${zi}`, inHigh ? 'high' : 'low');
      }
    }
    return desired;
  }

  getSegmentsForLod(lodLevel) {
    const lod = this.terrain.lod;
    return lodLevel === 'high' ? lod.highSegments : lod.lowSegments;
  }

  removeTerrainChunk(key, chunk) {
    this.engine.removeEntity(chunk.entity);
    if (chunk.scatterEntities) {
      for (const e of chunk.scatterEntities) this.engine.removeEntity(e);
    }
    this.terrain.chunks.delete(key);
  }

  createTerrainChunk(xIndex, zIndex, lodLevel = 'high') {
    const { chunkSize } = this.terrain;
    const segments = this.getSegmentsForLod(lodLevel);
    const width = chunkSize;
    const depth = chunkSize;
    const centerX = (xIndex + 0.5) * chunkSize;
    const centerZ = (zIndex + 0.5) * chunkSize;

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
    this.trails?.applyToMaterial(mat);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(centerX, this.terrain.renderOffset, centerZ);
    mesh.receiveShadow = true;
    mesh.visible = this.terrainVisible;

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
    entity.addComponent(new MeshComponent(mesh, { syncFromBody: false }));
    entity.addComponent(new PhysicsComponent(body));
    this.engine.addEntity(entity);

    const scatterEntities = this.scatterTerrainEntities(xIndex, zIndex, centerX, centerZ, width, depth);

    const basePositions = new Float32Array(positions.array);
    this.terrain.chunks.set(`${xIndex},${zIndex}`, {
      entity,
      body,
      mesh,
      lodLevel,
      scatterEntities,
      basePositions,
      centerX,
      centerZ,
    });
  }

  scatterTerrainEntities(xIndex, zIndex, centerX, centerZ, width, depth) {
    const scatter = this.terrain.scatter;
    const created = [];
    const placed = [];

    const treeRng = this.makeChunkRng(xIndex, zIndex, 1);
    const rampRng = this.makeChunkRng(xIndex, zIndex, 2);
    const sphereRng = this.makeChunkRng(xIndex, zIndex, 3);

    this.tryScatter(scatter.trees, 20, (pos) => {
      if (!this.isSlopeOk(pos.x, pos.z, scatter.maxSlopeDeg.tree)) return null;
      return {
        x: pos.x,
        z: pos.z,
        min: scatter.minSpacing.tree,
        place: () => this.addTreeAt(pos.x, this.getHeight(pos.x, pos.z), pos.z),
      };
    }, placed, created, centerX, centerZ, width, depth, treeRng);

    this.tryScatter(scatter.ramps, 30, (pos) => {
      if (!this.isSlopeOk(pos.x, pos.z, scatter.maxSlopeDeg.ramp)) return null;
      return {
        x: pos.x,
        z: pos.z,
        min: scatter.minSpacing.ramp,
        place: () => this.addRampAt(pos.x, this.getHeight(pos.x, pos.z) + 0.05, pos.z),
      };
    }, placed, created, centerX, centerZ, width, depth, rampRng);

    this.tryScatter(scatter.spheres, 20, (pos) => {
      return {
        x: pos.x,
        z: pos.z,
        min: scatter.minSpacing.sphere,
        place: () => this.addSphere(pos.x, this.getHeight(pos.x, pos.z) + 1.2, pos.z),
      };
    }, placed, created, centerX, centerZ, width, depth, sphereRng);

    return created;
  }

  tryScatter(count, maxAttempts, planFn, placed, created, centerX, centerZ, width, depth, rng) {
    let added = 0;
    let attempts = 0;
    while (added < count && attempts < count * maxAttempts) {
      attempts += 1;
      const pos = this.randomPointInChunk(centerX, centerZ, width, depth, rng);
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

  randomPointInChunk(centerX, centerZ, width, depth, rng = Math.random) {
    const x = centerX + (rng() - 0.5) * width;
    const z = centerZ + (rng() - 0.5) * depth;
    return { x, z };
  }

  makeChunkRng(xIndex, zIndex, salt = 0) {
    let seed = (this.terrain.seed ?? 0) | 0;
    seed = (seed + Math.imul(xIndex, 73856093) + Math.imul(zIndex, 19349663) + Math.imul(salt, 83492791)) | 0;
    return this.mulberry32(seed >>> 0);
  }

  mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
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

  getChunkIndices(x, z) {
    const { chunkSize } = this.terrain;
    return {
      xi: Math.floor(x / chunkSize),
      zi: Math.floor(z / chunkSize),
    };
  }

  stampTerrain(x, z, strength = 1) {
    if (!this.enableTerrainMeshDeform) return;
    const { chunkSize, deform } = this.terrain;
    const { xi, zi } = this.getChunkIndices(x, z);

    const stampChunk = (cx, cz) => this.stampTerrainInChunk(x, z, cx, cz, strength);
    stampChunk(xi, zi);

    const centerX = (xi + 0.5) * chunkSize;
    const centerZ = (zi + 0.5) * chunkSize;
    const localX = x - centerX;
    const localZ = z - centerZ;
    const half = chunkSize / 2;
    const radius = deform.radius;

    const nearLeft = localX < -half + radius;
    const nearRight = localX > half - radius;
    const nearBack = localZ < -half + radius;
    const nearFront = localZ > half - radius;

    if (nearLeft) stampChunk(xi - 1, zi);
    if (nearRight) stampChunk(xi + 1, zi);
    if (nearBack) stampChunk(xi, zi - 1);
    if (nearFront) stampChunk(xi, zi + 1);
    if (nearLeft && nearBack) stampChunk(xi - 1, zi - 1);
    if (nearLeft && nearFront) stampChunk(xi - 1, zi + 1);
    if (nearRight && nearBack) stampChunk(xi + 1, zi - 1);
    if (nearRight && nearFront) stampChunk(xi + 1, zi + 1);
  }

  stampTerrainSegment(x1, z1, x2, z2, strength = 1) {
    if (!this.enableTerrainMeshDeform) return;
    const { chunkSize, deform } = this.terrain;
    const radius = deform.radius;

    const minX = Math.min(x1, x2) - radius;
    const maxX = Math.max(x1, x2) + radius;
    const minZ = Math.min(z1, z2) - radius;
    const maxZ = Math.max(z1, z2) + radius;

    const minXi = Math.floor(minX / chunkSize);
    const maxXi = Math.floor(maxX / chunkSize);
    const minZi = Math.floor(minZ / chunkSize);
    const maxZi = Math.floor(maxZ / chunkSize);

    for (let zi = minZi; zi <= maxZi; zi++) {
      for (let xi = minXi; xi <= maxXi; xi++) {
        this.stampTerrainSegmentInChunk(x1, z1, x2, z2, xi, zi, strength);
      }
    }
  }

  stampTerrainInChunk(worldX, worldZ, xIndex, zIndex, strength = 1) {
    const key = `${xIndex},${zIndex}`;
    const chunk = this.terrain.chunks.get(key);
    if (!chunk?.mesh || !chunk.basePositions) return;

    const geometry = chunk.mesh.geometry;
    const positions = geometry.attributes.position;
    const base = chunk.basePositions;

    const localX = worldX - chunk.centerX;
    const localZ = worldZ - chunk.centerZ;
    const { radius, maxDepth } = this.terrain.deform;
    const radiusSq = radius * radius;

    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i);
      const vz = positions.getZ(i);
      const dx = vx - localX;
      const dz = vz - localZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;
      const dist = Math.sqrt(distSq);
      const falloff = 1 - dist / radius;
      const depth = maxDepth * falloff * strength;
      const baseY = base[i * 3 + 1];
      const target = baseY - depth;
      const current = positions.getY(i);
      if (target < current) positions.setY(i, target);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  stampTerrainSegmentInChunk(x1, z1, x2, z2, xIndex, zIndex, strength = 1) {
    const key = `${xIndex},${zIndex}`;
    const chunk = this.terrain.chunks.get(key);
    if (!chunk?.mesh || !chunk.basePositions) return;

    const geometry = chunk.mesh.geometry;
    const positions = geometry.attributes.position;
    const base = chunk.basePositions;

    const localX1 = x1 - chunk.centerX;
    const localZ1 = z1 - chunk.centerZ;
    const localX2 = x2 - chunk.centerX;
    const localZ2 = z2 - chunk.centerZ;

    const { radius, maxDepth } = this.terrain.deform;
    const dx = localX2 - localX1;
    const dz = localZ2 - localZ1;
    const denom = dx * dx + dz * dz;

    if (denom < 1e-8) {
      this.stampTerrainInChunk(x1, z1, xIndex, zIndex, strength);
      return;
    }

    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i);
      const vz = positions.getZ(i);
      const t = THREE.MathUtils.clamp(((vx - localX1) * dx + (vz - localZ1) * dz) / denom, 0, 1);
      const px = localX1 + dx * t;
      const pz = localZ1 + dz * t;
      const dist = Math.hypot(vx - px, vz - pz);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const depth = maxDepth * falloff * strength;
      const baseY = base[i * 3 + 1];
      const target = baseY - depth;
      const current = positions.getY(i);
      if (target < current) positions.setY(i, target);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }


  updateCameraFollow(dt) {
    if (!this.cameraFollowEnabled) return;
    if (!this.player || !this.engine?.camera) return;
    const body = this.player.getComponent('physics').body;
    const cam = this.engine.camera;
    const headingQuat = this.player.getComponent('mesh').mesh.quaternion;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headingQuat).normalize();
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

  setTerrainVisible(visible) {
    this.terrainVisible = !!visible;
    for (const chunk of this.terrain.chunks.values()) {
      if (chunk.mesh) chunk.mesh.visible = this.terrainVisible;
    }
  }

  setCameraFollowEnabled(enabled) {
    this.cameraFollowEnabled = !!enabled;
  }

  getHeight(x, z) {
    const { slope, mountainHeight, valleyWidthChunks, valleyDepth, chunkSize } = this.terrain;
    const baseSlope = z * slope;
    const valleyWidth = chunkSize * valleyWidthChunks;
    const valleyT = x / valleyWidth;
    const valley = valleyDepth * valleyT * valleyT;

    const ridge = 1 - Math.abs(this.fbm(x * 0.014, z * 0.014, 5) * 2 - 1);
    const detail = this.fbm(x * 0.07, z * 0.07, 4);

    return baseSlope + valley + ridge * mountainHeight + detail * 12.0;
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
