export class SphereController {
  constructor() {
    this.uniqueCollisions = new Set();
  }

  onStart() {
    this.uniqueCollisions.clear();
  }

  onCollide(other) {
    if (!other) return;
    if (!this.uniqueCollisions.has(other.id)) {
      this.uniqueCollisions.add(other.id);
    }
  }

  update() {
    // Placeholder for future per-frame logic.
  }

  onDestroy() {
    this.uniqueCollisions.clear();
  }
}
