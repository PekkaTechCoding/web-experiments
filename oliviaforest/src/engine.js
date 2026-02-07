import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js?module';
import { EngineCore } from './engine-core.js';
import { MeshComponent } from './entity.js';

export class Engine extends EngineCore {
  constructor({ mount = document.body, headless = false } = {}) {
    super();
    const hasWindow = typeof window !== 'undefined';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8f4f8);
    this.scene.fog = new THREE.Fog(0xe8f4f8, 40, 100);

    const width = hasWindow ? window.innerWidth : 800;
    const height = hasWindow ? window.innerHeight : 600;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    this.camera.position.set(0, 8, 18);

    this.renderer = null;
    this.controls = null;

    if (!headless) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(hasWindow ? Math.min(2, window.devicePixelRatio) : 1);
      this.renderer.shadowMap.enabled = true;
      mount.appendChild(this.renderer.domElement);

      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.target.set(0, 3, 0);

      if (hasWindow) {
        window.addEventListener('resize', () => {
          this.camera.aspect = window.innerWidth / window.innerHeight;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
      }
    }

    this.lastTime = null;
  }

  addEntity(entity) {
    if (entity.hasComponents(MeshComponent.type)) {
      const mesh = entity.getComponent(MeshComponent.type).mesh;
      this.scene.add(mesh);
    }
    super.addEntity(entity);
  }

  removeEntity(entity) {
    if (entity.hasComponents(MeshComponent.type)) {
      const mesh = entity.getComponent(MeshComponent.type).mesh;
      this.scene.remove(mesh);
    }
    super.removeEntity(entity);
  }

  run() {
    const animate = (time) => {
      requestAnimationFrame(animate);
      if (this.lastTime != null) {
        const dt = Math.min(0.033, (time - this.lastTime) / 1000);
        this.update(dt);
      }
      this.lastTime = time;
      if (this.controls) this.controls.update();
      if (this.renderer) this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(animate);
  }
}
