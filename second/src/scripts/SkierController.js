import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MeshComponent, PhysicsComponent } from '../entity.js';

export class SkierController {
  constructor(world, {
    accel = 24,
    turnRate = 1.6,
    airControl = 0.2,
    jumpImpulse = 4.5,
    sideFriction = 8.0,
    forwardDrag = 0.4,
    carveStrength = 18.0,
    boostImpulse = 48.0,
    boostCooldown = 0.0,
    boostMinSpeed = 12.0,
    gravitySlide = 22.0,
    minSlideAlign = 0.15,
  } = {}) {
    this.world = world;
    this.accel = accel;
    this.turnRate = turnRate;
    this.airControl = airControl;
    this.jumpImpulse = jumpImpulse;
    this.sideFriction = sideFriction;
    this.forwardDrag = forwardDrag;
    this.carveStrength = carveStrength;
    this.boostImpulse = boostImpulse;
    this.boostCooldown = boostCooldown;
    this.boostMinSpeed = boostMinSpeed;
    this.gravitySlide = gravitySlide;
    this.minSlideAlign = minSlideAlign;
    this.boostTimer = 0;
    this.boosting = false;
    this.boostRequested = false;

    this.heading = Math.PI; // facing -Z
    this.keys = new Set();
    this.jumpConsumed = false;
    this.onKeyDown = (e) => this.keys.add(e.code);
    this.onKeyUp = (e) => this.keys.delete(e.code);
  }

  onStart() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  onDestroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  update(dt) {
    const body = this.entity.getComponent(PhysicsComponent.type).body;
    const mesh = this.entity.getComponent(MeshComponent.type).mesh;

    const result = new CANNON.RaycastResult();
    const from = body.position.clone();
    const to = body.position.clone();
    to.y -= 3.0;
    const ray = new CANNON.Ray(from, to);
    ray.skipBackfaces = true;
    const hasHit = this.world.physicsWorld.raycastClosest(from, to, {
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
      skipBackfaces: true,
    }, result);

    let normal = new THREE.Vector3(0, 1, 0);
    let grounded = false;
    if (hasHit && result.hasHit) {
      normal = new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z).normalize();
      grounded = result.distance <= 1.2;
    }

    const touchSteer = this.world?.input?.steer ?? 0;
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    if (this.world?.input?.boost) {
      this.boostRequested = true;
      this.world.input.boost = false;
    }

    const steer = Math.max(-1, Math.min(1,
      (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0)
      + (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? -1 : 0)
      + touchSteer
    ));

    const turnStrength = grounded ? this.turnRate : this.turnRate * this.airControl;
    this.heading += steer * turnStrength * dt;

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).normalize();
    const forwardOnSlope = forward.clone().sub(normal.clone().multiplyScalar(forward.dot(normal))).normalize();

    if (grounded) {
      const downhill = new THREE.Vector3(0, -1, 0).projectOnPlane(normal).normalize();
      const align = Math.max(this.minSlideAlign, downhill.dot(forwardOnSlope));
      const slide = downhill.multiplyScalar(this.gravitySlide * align);
      body.applyForce(new CANNON.Vec3(slide.x, slide.y, slide.z), body.position);

      const right = new THREE.Vector3().crossVectors(forwardOnSlope, normal).normalize();
      const v = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
      const lateralSpeed = v.dot(right);
      const lateralForce = right.multiplyScalar(-lateralSpeed * this.sideFriction);
      body.applyForce(new CANNON.Vec3(lateralForce.x, lateralForce.y, lateralForce.z), body.position);

      const forwardSpeed = v.dot(forwardOnSlope);
      const forwardForce = forwardOnSlope.clone().multiplyScalar(-forwardSpeed * this.forwardDrag);
      body.applyForce(new CANNON.Vec3(forwardForce.x, forwardForce.y, forwardForce.z), body.position);

      if (steer !== 0) {
        const carveDir = right.clone().multiplyScalar(steer);
        const carveForce = carveDir.multiplyScalar(this.carveStrength);
        body.applyForce(new CANNON.Vec3(carveForce.x, 0, carveForce.z), body.position);
      }

      const wantsJump = this.keys.has('Space') || this.world?.input?.jump;
      if (wantsJump && !this.jumpConsumed) {
        body.applyImpulse(new CANNON.Vec3(0, this.jumpImpulse, 0), body.position);
        this.jumpConsumed = true;
      }
      if (!wantsJump) this.jumpConsumed = false;

      const wantsBoost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.boostRequested;
      if (!wantsBoost) this.boosting = false;

      if (wantsBoost && this.boostTimer === 0) {
        this.boosting = true;
        this.boostRequested = false;
      }

      if (this.boosting) {
        const v = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
        const speed = v.length();
        if (speed < this.boostMinSpeed) {
          const boost = forwardOnSlope.clone().multiplyScalar(this.boostImpulse);
          body.applyImpulse(new CANNON.Vec3(boost.x, boost.y, boost.z), body.position);
        } else {
          this.boosting = false;
          this.boostTimer = this.boostCooldown;
        }
      }
    } else {
      const force = new CANNON.Vec3(forwardOnSlope.x, forwardOnSlope.y, forwardOnSlope.z);
      body.applyForce(force.scale(this.accel * this.airControl), body.position);
    }

    // Align body/mesh orientation to slope + heading
    const look = forwardOnSlope.clone();
    const right = new THREE.Vector3().crossVectors(normal, look).normalize();
    const mat = new THREE.Matrix4().makeBasis(right, normal, look);
    const quat = new THREE.Quaternion().setFromRotationMatrix(mat);
    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    mesh.quaternion.copy(quat);
  }
}
