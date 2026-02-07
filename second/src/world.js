import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
import { Entity, MeshComponent, PhysicsComponent } from './entity.js';
import { SphereController } from './scripts/SphereController.js';
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
    scene.add(dir);

    // Ground (visual) - snow-covered ground
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xf5f9fc, roughness: 0.85, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    // Physics ground
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: new CANNON.Material('ground'),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    // Contact material - snowballs have higher friction and lower bounce
    const contact = new CANNON.ContactMaterial(groundBody.material, this.sphereMat, {
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

    const groundEntity = new Entity('ground');
    groundEntity.addComponent(new MeshComponent(ground));
    groundEntity.addComponent(new PhysicsComponent(groundBody));
    this.engine.addEntity(groundEntity);

    // Seed a few objects
    for (let i = 0; i < 5; i++) this.addSphere();
    for (let i = 0; i < 3; i++) this.addTree();
    for (let i = 0; i < 2; i++) this.addRamp();
    for (let i = 0; i < 2; i++) this.addSkier();
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
  }

  addTree(x = (Math.random() - 0.5) * 12, y = 0, z = (Math.random() - 0.5) * 12) {
    const trunkGeom = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 8);
    const leavesGeom = new THREE.ConeGeometry(1.2, 2.6, 10);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7b5a3c, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3c, roughness: 0.8 });

    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    const leaves = new THREE.Mesh(leavesGeom, leavesMat);

    trunk.position.set(x, 1.1, z);
    leaves.position.set(x, 2.7, z);

    trunk.castShadow = true;
    leaves.castShadow = true;

    const group = new THREE.Group();
    group.add(trunk, leaves);

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
    const geom = new THREE.BoxGeometry(3, 0.4, 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfd6e0, roughness: 0.7 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    mesh.rotation.x = -Math.PI / 9;

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
    const bodyGeom = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8);
    const headGeom = new THREE.SphereGeometry(0.25, 12, 12);
    const skiGeom = new THREE.BoxGeometry(1.6, 0.08, 0.2);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5d6c6, roughness: 0.5 });
    const skiMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 });

    const body = new THREE.Mesh(bodyGeom, bodyMat);
    const head = new THREE.Mesh(headGeom, headMat);
    const ski1 = new THREE.Mesh(skiGeom, skiMat);
    const ski2 = new THREE.Mesh(skiGeom, skiMat);

    body.position.set(x, y + 0.6, z);
    head.position.set(x, y + 1.4, z);
    ski1.position.set(x - 0.3, y, z + 0.3);
    ski2.position.set(x + 0.3, y, z - 0.3);

    const group = new THREE.Group();
    group.add(body, head, ski1, ski2);

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

  spawnRandomEntity() {
    const spawners = [
      () => this.addSphere(),
      () => this.addTree(),
      () => this.addRamp(),
      () => this.addSkier(),
    ];
    const pick = spawners[Math.floor(Math.random() * spawners.length)];
    pick();
  }
}
