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
}
