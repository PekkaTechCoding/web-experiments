let nextEntityId = 1;

export class Entity {
  constructor(name) {
    this.id = nextEntityId++;
    this.name = name;
    this.components = new Map();
    this.scripts = [];
  }

  addComponent(component) {
    this.components.set(component.type, component);
    component.entity = this;
    return this;
  }

  addScript(script) {
    script.entity = this;
    this.scripts.push(script);
    return this;
  }

  getComponent(type) {
    return this.components.get(type);
  }

  hasComponents(...types) {
    return types.every((type) => this.components.has(type));
  }
}

export class MeshComponent {
  static type = 'mesh';

  constructor(mesh) {
    this.type = MeshComponent.type;
    this.mesh = mesh;
  }
}

export class PhysicsComponent {
  static type = 'physics';

  constructor(body) {
    this.type = PhysicsComponent.type;
    this.body = body;
  }
}
