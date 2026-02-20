import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js?module';

export class AssetLoader {
  constructor() {
    this.gltf = new GLTFLoader();
    this.cache = new Map();
  }

  async loadGLTF(url) {
    if (this.cache.has(url)) return this.cache.get(url).clone();
    const gltf = await this.gltf.loadAsync(url);
    const scene = gltf.scene || gltf.scenes?.[0];
    if (scene) this.cache.set(url, scene);
    return scene?.clone() || null;
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

  createSkierMesh() {
    // Attribution (planned replacement): "Skier low poly character" by Sweed (SweeD_tort)
    // https://sketchfab.com/3d-models/skier-low-poly-character-13ae2a85b3af43ab8b1e984c8f8c87e2
    // License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
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
}
