import { MeshComponent, PhysicsComponent } from './entity.js';

export class EngineCore {
  constructor() {
    this.world = null;
    this.physicsWorld = null;
    this.bodyToEntity = new Map();
    this.started = false;
    this.postUpdateCallbacks = [];
  }

  setWorld(world) {
    this.world = world;
    this.physicsWorld = world.physicsWorld;
  }

  addEntity(entity) {
    if (!this.world) throw new Error('Engine world not set');
    this.world.addEntity(entity);

    if (this.physicsWorld && entity.hasComponents(PhysicsComponent.type)) {
      const body = entity.getComponent(PhysicsComponent.type).body;
      this.physicsWorld.addBody(body);
      this.bodyToEntity.set(body, entity);

      body.addEventListener('collide', (event) => {
        const other = this.bodyToEntity.get(event.body);
        this.notifyCollision(entity, other, event);
      });
    }

    if (this.started) this.runStart(entity);
  }

  removeEntity(entity) {
    this.runDestroy(entity);

    if (this.physicsWorld && entity.hasComponents(PhysicsComponent.type)) {
      const body = entity.getComponent(PhysicsComponent.type).body;
      this.physicsWorld.removeBody(body);
      this.bodyToEntity.delete(body);
    }

    this.world.removeEntity(entity);
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const entity of this.world.entities) this.runStart(entity);
  }

  update(dt) {
    if (this.physicsWorld) {
      this.physicsWorld.step(1 / 60, dt, 3);

      for (const entity of this.world.entities) {
        if (entity.hasComponents(MeshComponent.type, PhysicsComponent.type)) {
          const mesh = entity.getComponent(MeshComponent.type).mesh;
          const body = entity.getComponent(PhysicsComponent.type).body;
          if (mesh) {
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);
          }
        }
      }
    }

    for (const entity of this.world.entities) {
      for (const script of entity.scripts) {
        if (typeof script.update === 'function') script.update(dt);
      }
    }

    for (const cb of this.postUpdateCallbacks) cb(dt);
  }

  runStart(entity) {
    for (const script of entity.scripts) {
      if (typeof script.onStart === 'function') script.onStart();
    }
  }

  runDestroy(entity) {
    for (const script of entity.scripts) {
      if (typeof script.onDestroy === 'function') script.onDestroy();
    }
  }

  addPostUpdate(callback) {
    this.postUpdateCallbacks.push(callback);
  }

  notifyCollision(entity, other, event) {
    if (!entity) return;
    for (const script of entity.scripts) {
      if (typeof script.onCollide === 'function') script.onCollide(other, event);
    }
  }
}
