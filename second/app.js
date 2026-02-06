import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js?module';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8f4f8);
scene.fog = new THREE.Fog(0xe8f4f8, 40, 100);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 8, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);

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
scene.add(ground);

// Physics world
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

// Physics ground
const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
  material: new CANNON.Material('ground'),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Contact material - snowballs have higher friction and lower bounce
const sphereMat = new CANNON.Material('sphere');
const contact = new CANNON.ContactMaterial(groundBody.material, sphereMat, {
  friction: 0.8,
  restitution: 0.2,
});
world.addContactMaterial(contact);
// Snowball-to-snowball interactions
const sphereContact = new CANNON.ContactMaterial(sphereMat, sphereMat, {
  friction: 0.7,
  restitution: 0.15,
});
world.addContactMaterial(sphereContact);

class Entity {
  constructor(name) {
    this.name = name;
    this.components = new Map();
  }

  addComponent(component) {
    this.components.set(component.type, component);
    component.entity = this;
    return this;
  }

  getComponent(type) {
    return this.components.get(type);
  }

  hasComponents(...types) {
    return types.every((type) => this.components.has(type));
  }
}

class MeshComponent {
  static type = 'mesh';

  constructor(mesh) {
    this.type = MeshComponent.type;
    this.mesh = mesh;
  }
}

class PhysicsComponent {
  static type = 'physics';

  constructor(body) {
    this.type = PhysicsComponent.type;
    this.body = body;
  }
}

const entities = [];

function addSphere(x = (Math.random() - 0.5) * 6, y = 12 + Math.random() * 6, z = (Math.random() - 0.5) * 6) {
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
  scene.add(mesh);

  // Snowballs are slightly heavier due to compacted snow
  const body = new CANNON.Body({
    mass: r * 2.5,
    shape: new CANNON.Sphere(r),
    position: new CANNON.Vec3(x, y, z),
    material: sphereMat,
    linearDamping: 0.15,
    angularDamping: 0.3,
  });
  world.addBody(body);

  const entity = new Entity('snowball');
  entity.addComponent(new MeshComponent(mesh));
  entity.addComponent(new PhysicsComponent(body));
  entities.push(entity);
}

// Seed a few spheres
for (let i = 0; i < 8; i++) addSphere();

// Click/touch to add more
window.addEventListener('pointerdown', (e) => {
  // ignore right-click / secondary
  if (e.button && e.button !== 0) return;
  addSphere();
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
let lastTime;
function animate(time) {
  requestAnimationFrame(animate);
  if (lastTime != null) {
    const dt = Math.min(0.033, (time - lastTime) / 1000);
    world.step(1 / 60, dt, 3);

    for (const entity of entities) {
      if (entity.hasComponents(MeshComponent.type, PhysicsComponent.type)) {
        const mesh = entity.getComponent(MeshComponent.type).mesh;
        const body = entity.getComponent(PhysicsComponent.type).body;
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
      }
    }
  }
  lastTime = time;
  controls.update();
  renderer.render(scene, camera);
}
animate();
