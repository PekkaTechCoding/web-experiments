import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MeshComponent, PhysicsComponent } from '../entity.js';

export class SkierController2 {
  constructor(world, {
    steerTorque = 18.0,
    uprightTorque = 50.0,
    uprightDamping = 8.0,
    autoDownhillTorque = 3.0,
    boostSpeed = 5.0,
    jumpSpeed = 5.0,
    groundProbe = 0.20,
  } = {}) {
    this.world = world;
    this.steerTorque = steerTorque;
    this.uprightTorque = uprightTorque;
    this.uprightDamping = uprightDamping;
    this.autoDownhillTorque = autoDownhillTorque;
    this.boostSpeed = boostSpeed;
    this.jumpSpeed = jumpSpeed;
    this.groundProbe = groundProbe;

    this.keys = new Set();
    this.jumpConsumed = false;
    this.boostRequested = false;
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

    // a) Check ground contact
    const result = new CANNON.RaycastResult();
    const footOffset = body.userData?.footOffset ?? 0.95;
    const downDir = new CANNON.Vec3(0, -1, 0);
    body.quaternion.vmult(downDir, downDir);
    const from = body.position.vadd(downDir.scale(footOffset));
    const downDir2 = new CANNON.Vec3(downDir.x, downDir.y, downDir.z);
    const to = body.position.vadd(downDir2.scale(footOffset + this.groundProbe));
    const hasHit = this.world.physicsWorld.raycastClosest(from, to, {
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
      skipBackfaces: true,
    }, result);

    let grounded = false;
    let normal = new THREE.Vector3(0, 1, 0);
    let hitPoint = null;
    if (hasHit && result.hasHit) {
      grounded = true;
      normal = new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z).normalize();
      hitPoint = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
    }
    if (grounded) {
      if (!this.smoothedNormal) {
        this.smoothedNormal = normal.clone();
      } else {
        const t = THREE.MathUtils.clamp(10.0 * dt, 0, 1);
        this.smoothedNormal.lerp(normal, t).normalize();
      }
      normal = this.smoothedNormal.clone();
    }

    // b) Gather inputs
    const touchSteer = this.world?.input?.steer ?? 0;
    const keySteer =
      (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0)
      + (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? -1 : 0);
    const steer = Math.max(-1, Math.min(1, keySteer + touchSteer));

    const wantsJump = this.keys.has('Space') || this.world?.input?.jump;
    if (this.world?.input?.boost) {
      this.boostRequested = true;
      this.world.input.boost = false;
    }
    const wantsBoost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.boostRequested;

    // c) Compute vectors on surface
    const currentQuat = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(currentQuat).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(currentQuat).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const alignNormal = grounded ? normal : worldUp;

    let forwardOnPlane = forward.clone().sub(alignNormal.clone().multiplyScalar(forward.dot(alignNormal)));
    if (forwardOnPlane.lengthSq() > 1e-6) forwardOnPlane.normalize();
    if (this.smoothedForwardOnPlane) {
      if (forwardOnPlane.dot(this.smoothedForwardOnPlane) < 0) {
        forwardOnPlane.multiplyScalar(-1);
      }
      const t = THREE.MathUtils.clamp(8.0 * dt, 0, 1);
      this.smoothedForwardOnPlane.lerp(forwardOnPlane, t).normalize();
      forwardOnPlane = this.smoothedForwardOnPlane.clone();
    } else {
      this.smoothedForwardOnPlane = forwardOnPlane.clone();
    }

    const v = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
    const vPlane = v.clone().sub(alignNormal.clone().multiplyScalar(v.dot(alignNormal)));
    const surfaceSpeed = vPlane.length();

    if (!this.world.debug) this.world.debug = {};
    this.world.debug.forwardSpeed = forwardOnPlane.lengthSq() > 1e-6 ? vPlane.dot(forwardOnPlane) : 0;
    this.world.debug.lateralSpeed = forwardOnPlane.lengthSq() > 1e-6 ? vPlane.clone().sub(forwardOnPlane.clone().multiplyScalar(vPlane.dot(forwardOnPlane))).length() : 0;

    // Debug: expose ground normal for physics debug view
    if (this.world.debug) {
      const arrowPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      this.world.debug.groundNormal = { position: arrowPos, direction: normal.clone().normalize() };
      this.world.debug.forwardOnPlane = { position: arrowPos, direction: forwardOnPlane.clone() };
    }

    // d) Steering torque (air + ground)
    if (steer !== 0) {
      const axis = new CANNON.Vec3(alignNormal.x, alignNormal.y, alignNormal.z);
      const torque = axis.scale(this.steerTorque * steer * body.mass);
      body.applyTorque(torque);
    } else if (grounded && surfaceSpeed > 0.2) {
      const downhill = new THREE.Vector3(0, -1, 0).projectOnPlane(alignNormal).normalize();
      if (downhill.lengthSq() > 1e-6 && forwardOnPlane.lengthSq() > 1e-6) {
        const crossY = new THREE.Vector3().crossVectors(forwardOnPlane, downhill).y;
        const align = THREE.MathUtils.clamp(forwardOnPlane.dot(downhill), -1, 1);
        const angle = Math.acos(align);
        const turn = Math.sign(crossY) * angle;
        const torque = new CANNON.Vec3(0, 1, 0).scale(this.autoDownhillTorque * turn * body.mass);
        body.applyTorque(torque);
      }
    }

    // e) Align player upright to world Y (no surface alignment)
    {
      const cross = new THREE.Vector3().crossVectors(up, worldUp);
      const torqueVec = cross.multiplyScalar(this.uprightTorque * body.mass);
      body.applyTorque(new CANNON.Vec3(torqueVec.x, torqueVec.y, torqueVec.z));

      const angVel = new THREE.Vector3(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z);
      const damp = new THREE.Vector3(angVel.x, 0, angVel.z).multiplyScalar(-this.uprightDamping * body.mass);
      body.applyTorque(new CANNON.Vec3(damp.x, damp.y, damp.z));
    }

    if (grounded) {
      // f) Jump: set normal speed to jumpSpeed
      if (wantsJump && !this.jumpConsumed) {
        const vNormal = v.dot(alignNormal);
        const dv = Math.max(0, this.jumpSpeed - vNormal);
        if (dv > 0) {
          const impulse = alignNormal.clone().multiplyScalar(dv * body.mass);
          body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), body.position);
        }
        this.jumpConsumed = true;
      }
      if (!wantsJump) this.jumpConsumed = false;

      // i) Boost: set surface speed to boostSpeed
      if (wantsBoost) {
        this.boostRequested = false;
        if (forwardOnPlane.lengthSq() > 1e-6) {
          const along = vPlane.dot(forwardOnPlane);
          const dv = Math.max(0, this.boostSpeed - along);
          if (dv > 0) {
            const impulse = forwardOnPlane.clone().multiplyScalar(dv * body.mass);
            body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), body.position);
          }
        }
      }
    }

    // j) Visual sync (no direct rotation changes)
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}
