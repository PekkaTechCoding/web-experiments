import * as THREE from 'three';

const DEFAULT_PLANE_SIZE = 50;

export class PhysicsDebug {
  constructor(scene, physicsWorld, { color = 0xff3333 } = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.color = color;
    this.enabled = false;
    this.root = new THREE.Group();
    this.root.visible = false;
    this.scene.add(this.root);
    this.bodyGroups = new Map();
    this.material = new THREE.LineBasicMaterial({ color: this.color });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.root.visible = enabled;
  }

  update() {
    if (!this.enabled) return;
    this.syncBodies();

    for (const body of this.physicsWorld.bodies) {
      const group = this.bodyGroups.get(body);
      if (!group) continue;
      group.position.copy(body.position);
      group.quaternion.copy(body.quaternion);
    }
  }

  syncBodies() {
    // Add missing
    for (const body of this.physicsWorld.bodies) {
      if (!this.bodyGroups.has(body)) {
        const group = new THREE.Group();
        this.buildShapeMeshes(body, group);
        this.root.add(group);
        this.bodyGroups.set(body, group);
      }
    }

    // Remove stale
    for (const [body, group] of this.bodyGroups) {
      if (!this.physicsWorld.bodies.includes(body)) {
        this.root.remove(group);
        this.bodyGroups.delete(body);
      }
    }
  }

  buildShapeMeshes(body, group) {
    for (let i = 0; i < body.shapes.length; i++) {
      const shape = body.shapes[i];
      const offset = body.shapeOffsets[i];
      const orientation = body.shapeOrientations[i];

      const mesh = this.createWireframeForShape(shape);
      if (!mesh) continue;

      mesh.position.copy(offset);
      mesh.quaternion.copy(orientation);
      group.add(mesh);
    }
  }

  createWireframeForShape(shape) {
    let geom = null;
    switch (shape.type) {
      case 1: // Sphere
        geom = new THREE.SphereGeometry(shape.radius, 12, 12);
        break;
      case 2: // Plane
        geom = new THREE.PlaneGeometry(DEFAULT_PLANE_SIZE, DEFAULT_PLANE_SIZE, 4, 4);
        break;
      case 3: // Box
        geom = new THREE.BoxGeometry(shape.halfExtents.x * 2, shape.halfExtents.y * 2, shape.halfExtents.z * 2);
        break;
      case 4: // Cylinder
        geom = new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, 12);
        break;
      default:
        return null;
    }

    const edges = new THREE.EdgesGeometry(geom);
    return new THREE.LineSegments(edges, this.material);
  }
}
