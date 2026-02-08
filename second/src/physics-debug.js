import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
    this.groundNormalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      2.0,
      0x22aa55,
    );
    this.groundNormalArrow.visible = false;
    this.root.add(this.groundNormalArrow);
    this.forwardArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      2.0,
      0x2266ff,
    );
    this.forwardArrow.visible = false;
    this.root.add(this.forwardArrow);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.root.visible = enabled;
    this.groundNormalArrow.visible = enabled;
    this.forwardArrow.visible = enabled;
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

  setGroundNormal(position, direction) {
    this.groundNormalArrow.position.copy(position);
    this.groundNormalArrow.setDirection(direction.clone().normalize());
    this.groundNormalArrow.visible = this.enabled;
  }

  setForwardOnPlane(position, direction) {
    const dir = direction.clone();
    if (dir.lengthSq() < 1e-6) return;
    this.forwardArrow.position.copy(position);
    this.forwardArrow.setDirection(dir.normalize());
    this.forwardArrow.visible = this.enabled;
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
      case CANNON.Shape.types.SPHERE:
        geom = new THREE.SphereGeometry(shape.radius, 12, 12);
        break;
      case CANNON.Shape.types.PLANE:
        geom = new THREE.PlaneGeometry(DEFAULT_PLANE_SIZE, DEFAULT_PLANE_SIZE, 4, 4);
        break;
      case CANNON.Shape.types.BOX:
        geom = new THREE.BoxGeometry(shape.halfExtents.x * 2, shape.halfExtents.y * 2, shape.halfExtents.z * 2);
        break;
      case CANNON.Shape.types.CYLINDER:
        geom = new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, 12);
        break;
      case CANNON.Shape.types.HEIGHTFIELD:
        geom = this.buildHeightfieldGeometry(shape);
        break;
      case CANNON.Shape.types.TRIMESH:
        geom = this.buildTrimeshGeometry(shape);
        break;
      default:
        return null;
    }

    const edges = new THREE.EdgesGeometry(geom);
    return new THREE.LineSegments(edges, this.material);
  }

  buildHeightfieldGeometry(shape) {
    const data = shape.data;
    if (!data || !data.length) return null;

    const widthSegments = data.length - 1;
    const depthSegments = data[0].length - 1;
    const width = widthSegments * shape.elementSize;
    const depth = depthSegments * shape.elementSize;

    const geometry = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(width / 2, 0, depth / 2);

    const positions = geometry.attributes.position;
    let index = 0;
    for (let zi = 0; zi <= depthSegments; zi++) {
      for (let xi = 0; xi <= widthSegments; xi++) {
        positions.setY(index, data[xi][zi]);
        index++;
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  buildTrimeshGeometry(shape) {
    const vertices = shape.vertices;
    const indices = shape.indices;
    if (!vertices || !indices || !vertices.length || !indices.length) return null;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(indices.length * 3);

    for (let i = 0; i < indices.length; i++) {
      const vIndex = indices[i] * 3;
      positions[i * 3] = vertices[vIndex];
      positions[i * 3 + 1] = vertices[vIndex + 1];
      positions[i * 3 + 2] = vertices[vIndex + 2];
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}
