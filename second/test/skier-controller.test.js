import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Entity, MeshComponent, PhysicsComponent } from '../src/entity.js';
import { SkierController2 } from '../src/scripts/SkierController2.js';

describe('SkierController2', () => {
  it('updates without throwing and aligns velocity toward skis', () => {
    const world = {
      physicsWorld: {
        raycastClosest() {
          return false;
        },
      },
      input: {
        steer: 0,
      },
    };

    const entity = new Entity('player');
    const mesh = new THREE.Object3D();
    const body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(0.5),
      position: new CANNON.Vec3(0, 2, 0),
    });
    body.velocity.set(2, 0, 0);

    entity.addComponent(new MeshComponent(mesh));
    entity.addComponent(new PhysicsComponent(body));

    const controller = new SkierController2(world);
    entity.addScript(controller);

    expect(() => controller.update(0.016)).not.toThrow();
  });
});
