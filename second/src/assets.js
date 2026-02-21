import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js?module';
import { FBXLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/FBXLoader.js?module';
import * as SkeletonUtils from 'https://unpkg.com/three@0.161.0/examples/jsm/utils/SkeletonUtils.js?module';

export class AssetLoader {
  constructor() {
    this.gltf = new GLTFLoader();
    this.fbx = new FBXLoader();
    this.cache = new Map();
  }

  cloneModel(model) {
    return SkeletonUtils.clone(model);
  }

  async loadGLTF(url) {
    if (this.cache.has(url)) return this.cloneModel(this.cache.get(url));
    const gltf = await this.gltf.loadAsync(url);
    const scene = gltf.scene || gltf.scenes?.[0];
    if (scene) this.cache.set(url, scene);
    return scene ? this.cloneModel(scene) : null;
  }

  async loadSkierModel() {
    return this.loadGLTF('./models/skier_low_poly_character.glb');
  }

  async loadSnowboardModel() {
    return this.loadGLTF('./models/snowboard.glb');
  }

  createTreeMesh() {
    const trunkGeom = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 8);
    const leavesGeom = new THREE.ConeGeometry(1.2, 2.6, 10);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7b5a3c, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3c, roughness: 0.8 });

    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    const leaves = new THREE.Mesh(leavesGeom, leavesMat);

    trunk.position.set(0, -0.4, 0);
    leaves.position.set(0, 1.2, 0);

    trunk.castShadow = true;
    leaves.castShadow = true;

    const group = new THREE.Group();
    group.add(trunk, leaves);

    return group;
  }

  createRampMesh() {
    const geom = new THREE.BoxGeometry(3, 0.4, 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfd6e0, roughness: 0.7 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.rotation.x = -Math.PI / 9;
    return mesh;
  }

  createSkierPlaceholderMesh() {
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

    body.position.set(0, -0.1, 0);
    head.position.set(0, 0.7, 0);
    ski1.position.set(-0.3, -0.7, 0.3);
    ski2.position.set(0.3, -0.7, -0.3);
    ski1.rotation.y = Math.PI / 2;
    ski2.rotation.y = Math.PI / 2;
    body.castShadow = true;
    head.castShadow = true;
    ski1.castShadow = true;
    ski2.castShadow = true;

    const group = new THREE.Group();
    group.add(body, head, ski1, ski2);

    return group;
  }

  normalizeSkierModel(model, {
    targetHeight = 1.7,
    desiredMinY = -0.75,
    baseScale = 1,
  } = {}) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
      }
    });

    if (Number.isFinite(baseScale) && baseScale !== 1) {
      model.scale.setScalar(baseScale);
    }

    model.updateWorldMatrix(true, true);
    const initialBox = new THREE.Box3().setFromObject(model);
    if (!Number.isFinite(initialBox.min.y) || !Number.isFinite(initialBox.max.y)) {
      console.warn('Skier model has no visible geometry; keeping placeholder.');
      return false;
    }
    const size = initialBox.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? targetHeight / size.y : 1;
    model.scale.multiplyScalar(scale);

    model.updateWorldMatrix(true, true);
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = scaledBox.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;

    model.updateWorldMatrix(true, true);
    const centeredBox = new THREE.Box3().setFromObject(model);
    model.position.y += desiredMinY - centeredBox.min.y;
    return true;
  }

  getSkierBaseScale() {
    return 1;
  }

  async attachSnowboard(model) {
    const snowboard = await this.loadSnowboardModel();
    if (!snowboard) return;
    snowboard.rotation.y = Math.PI/2;
      

    snowboard.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    model.updateWorldMatrix(true, true);
    const skierBox = new THREE.Box3().setFromObject(model);
    const skierSize = skierBox.getSize(new THREE.Vector3());
    const skierCenterWorld = skierBox.getCenter(new THREE.Vector3());
    const skierMinPointWorld = new THREE.Vector3(skierCenterWorld.x, skierBox.min.y, skierCenterWorld.z);
    const skierMinPointLocal = model.worldToLocal(skierMinPointWorld);

    snowboard.updateWorldMatrix(true, true);
    const boardBox = new THREE.Box3().setFromObject(snowboard);
    const boardSize = boardBox.getSize(new THREE.Vector3());
    const targetLength = Math.max(1.2, skierSize.x * 1.1);
    const boardLength = Math.max(boardSize.x, boardSize.z);
    const boardScale = boardLength > 0 ? targetLength / boardLength : 1;
    snowboard.scale.setScalar(boardScale);

    snowboard.updateWorldMatrix(true, true);
    const scaledBoardBox = new THREE.Box3().setFromObject(snowboard);
    const boardMinY = scaledBoardBox.min.y;

    const boardCenter = scaledBoardBox.getCenter(new THREE.Vector3());
    snowboard.position.x += -boardCenter.x;
    snowboard.position.z += -boardCenter.z;
    const boardLift = 0.03;
    snowboard.position.y += skierMinPointLocal.y - boardMinY + boardLift;
    snowboard.updateWorldMatrix(true, true);
    model.add(snowboard);
  }

  createSkierMesh() {
    const group = new THREE.Group();
    const visualRoot = new THREE.Group();
    const placeholder = this.createSkierPlaceholderMesh();
    visualRoot.add(placeholder);
    group.add(visualRoot);

    this.loadSkierModel().then(async (model) => {
      if (!model) return;

      const baseScale = this.getSkierBaseScale();
      if (!this.normalizeSkierModel(model, { baseScale })) return;
      model.rotation.y = Math.PI;
      await this.attachSnowboard(model);
      model.updateWorldMatrix(true, true);
      visualRoot.add(model);
      placeholder.visible = false;
    }).catch((err) => {
      console.warn('Failed to load skier model:', err);
    });

    return group;
  }
}
