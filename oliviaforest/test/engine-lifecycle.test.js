import { describe, it, expect, vi } from 'vitest';
import { EngineCore as Engine } from '../src/engine-core.js';
import { Entity } from '../src/entity.js';

function createScript() {
  return {
    onStart: vi.fn(),
    update: vi.fn(),
    onDestroy: vi.fn(),
    onCollide: vi.fn(),
  };
}

describe('Engine lifecycle callbacks', () => {
  it('calls onStart, update, onDestroy', () => {
    const engine = new Engine();
    engine.setWorld({
      entities: [],
      addEntity(entity) {
        this.entities.push(entity);
      },
      removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index !== -1) this.entities.splice(index, 1);
      },
      physicsWorld: null,
    });
    const entity = new Entity('test');
    const script = createScript();
    entity.addScript(script);

    engine.addEntity(entity);
    engine.start();
    engine.update(0.016);
    engine.removeEntity(entity);

    expect(script.onStart).toHaveBeenCalledTimes(1);
    expect(script.update).toHaveBeenCalledTimes(1);
    expect(script.onDestroy).toHaveBeenCalledTimes(1);
  });

  it('calls onCollide with other entity', () => {
    const engine = new Engine();
    engine.setWorld({
      entities: [],
      addEntity(entity) {
        this.entities.push(entity);
      },
      removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index !== -1) this.entities.splice(index, 1);
      },
      physicsWorld: null,
    });
    const a = new Entity('a');
    const b = new Entity('b');
    const script = createScript();
    a.addScript(script);

    engine.addEntity(a);
    engine.addEntity(b);

    engine.notifyCollision(a, b, { hit: true });

    expect(script.onCollide).toHaveBeenCalledTimes(1);
    expect(script.onCollide).toHaveBeenCalledWith(b, { hit: true });
  });
});
