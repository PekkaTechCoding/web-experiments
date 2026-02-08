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
    forwardDrag = 0.2,
    alignStrength = 4.0,
    misalignmentDrag = 6.0,
    misalignmentDeg = 30.0,
    normalAlignRate = 6.0,
    forwardAlignRate = 3.0,
    normalSmoothRate = 1.0,
    airUprightRate = 1.5,
    carveStrength = 18.0,
    boostImpulse = 48.0,
    boostCooldown = 0.0,
    boostMinSpeed = 12.0,
    gravitySlide = 22.0,
    minSlideAlign = 0.15,
    airAngularTorque = 60.0,
  } = {}) {
    this.world = world;
    this.accel = accel;
    this.turnRate = turnRate;
    this.airControl = airControl;
    this.jumpImpulse = jumpImpulse;
    this.sideFriction = sideFriction;
    this.forwardDrag = forwardDrag;
    this.alignStrength = alignStrength;
    this.misalignmentDrag = misalignmentDrag;
    this.misalignmentDeg = misalignmentDeg;
    this.normalAlignRate = normalAlignRate;
    this.forwardAlignRate = forwardAlignRate;
    this.normalSmoothRate = normalSmoothRate;
    this.airUprightRate = airUprightRate;
    this.carveStrength = carveStrength;
    this.boostImpulse = boostImpulse;
    this.boostCooldown = boostCooldown;
    this.boostMinSpeed = boostMinSpeed;
    this.gravitySlide = gravitySlide;
    this.minSlideAlign = minSlideAlign;
    this.airAngularTorque = airAngularTorque;
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
    const footOffset = body.userData?.footOffset ?? 0.95;
    const down = new CANNON.Vec3(0, -1, 0);
    body.quaternion.vmult(down, down);
    const probe = footOffset + 0.25;
    const from = body.position.vadd(down.scale(footOffset));
    const to = body.position.vadd(down.scale(probe));
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
      grounded = true;
    }
    if (grounded) {
      if (!this.smoothedNormal) {
        this.smoothedNormal = normal.clone();
      } else {
        const t = THREE.MathUtils.clamp(this.normalSmoothRate * dt, 0, 1);
        this.smoothedNormal.lerp(normal, t).normalize();
      }
      normal = this.smoothedNormal.clone();
    }

    const touchSteer = this.world?.input?.steer ?? 0;
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    if (this.world?.input?.boost) {
      this.boostRequested = true;
      this.world.input.boost = false;
    }

    const keySteer =
      (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0)
      + (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? -1 : 0);
    const steer = Math.max(-1, Math.min(1, keySteer + touchSteer));

    const turnBoost = keySteer !== 0 ? 1.35 : 1.0;
    const baseTurn = grounded ? this.turnRate : this.turnRate * this.airControl;
    const turnStrength = baseTurn * turnBoost;
    this.heading += steer * turnStrength * dt;

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).normalize();
    const forwardOnSlope = forward.clone().sub(normal.clone().multiplyScalar(forward.dot(normal))).normalize();
    const right = new THREE.Vector3().crossVectors(forwardOnSlope, normal).normalize();
    const v = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
    const speed = v.length();
    const vDir = speed > 0.001 ? v.clone().multiplyScalar(1 / speed) : forwardOnSlope.clone();
    const lateralSpeed = v.dot(right);
    const forwardSpeed = v.dot(forwardOnSlope);

    if (!this.world.debug) this.world.debug = {};
    this.world.debug.forwardSpeed = forwardSpeed;
    this.world.debug.lateralSpeed = lateralSpeed;

    if (grounded) {
      const downhill = new THREE.Vector3(0, -1, 0).projectOnPlane(normal).normalize();
      const downhillAlign = Math.max(this.minSlideAlign, downhill.dot(forwardOnSlope));
      const slide = downhill.multiplyScalar(this.gravitySlide * downhillAlign);
      body.applyForce(new CANNON.Vec3(slide.x, slide.y, slide.z), body.position);

      const lateralForce = right.multiplyScalar(-lateralSpeed * this.sideFriction);
      body.applyForce(new CANNON.Vec3(lateralForce.x, lateralForce.y, lateralForce.z), body.position);

      const align = THREE.MathUtils.clamp(vDir.dot(forwardOnSlope), -1, 1);
      const alignFactor = 1 - Math.max(0, align);
      const forwardForce = forwardOnSlope.clone().multiplyScalar(-forwardSpeed * this.forwardDrag * alignFactor);
      body.applyForce(new CANNON.Vec3(forwardForce.x, forwardForce.y, forwardForce.z), body.position);

      const steerDir = forwardOnSlope
        .clone()
        .sub(vDir)
        .multiplyScalar(this.alignStrength * Math.max(1, speed) * dt);
      body.applyForce(new CANNON.Vec3(steerDir.x, steerDir.y, steerDir.z), body.position);

      const angle = Math.acos(Math.max(-1, Math.min(1, align)));
      const threshold = THREE.MathUtils.degToRad(this.misalignmentDeg);
      if (angle > threshold && speed > 0.1) {
        const t = (angle - threshold) / (Math.PI - threshold);
        const slow = vDir.clone().multiplyScalar(-this.misalignmentDrag * t * speed);
        body.applyForce(new CANNON.Vec3(slow.x, slow.y, slow.z), body.position);
      }

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
    } else if (steer !== 0 && this.airAngularTorque > 0) {
      const torque = new CANNON.Vec3(0, this.airAngularTorque * steer, 0);
      body.applyTorque(torque);
   }

    // Align body/mesh orientation with separate rates for normal and forward direction.
    const currentQuat = new THREE.Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    );

    const alignNormal = grounded ? normal : new THREE.Vector3(0, 1, 0);
    const normalRate = grounded ? this.normalAlignRate : this.airUprightRate;
    const normalAlignT = THREE.MathUtils.clamp(normalRate * dt, 0, 1);
    const forwardAlignT = grounded ? THREE.MathUtils.clamp(this.forwardAlignRate * dt, 0, 1) : 0;

    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(currentQuat).normalize();
    const qToNormal = new THREE.Quaternion().setFromUnitVectors(currentUp, alignNormal);
    const qNormalStep = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), qToNormal, normalAlignT);
    const qAfterNormal = qNormalStep.multiply(currentQuat);

    const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(qAfterNormal).normalize();
    let desiredForward = speed > 0.25 ? vDir.clone() : forwardOnSlope.clone();
    desiredForward = desiredForward.sub(alignNormal.clone().multiplyScalar(desiredForward.dot(alignNormal))).normalize();
    if (desiredForward.lengthSq() < 1e-6) desiredForward = currentForward.clone();

    const cross = new THREE.Vector3().crossVectors(currentForward, desiredForward);
    const sin = alignNormal.dot(cross);
    const cos = THREE.MathUtils.clamp(currentForward.dot(desiredForward), -1, 1);
    const angle = Math.atan2(sin, cos);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(alignNormal, angle * forwardAlignT);
    const quat = qYaw.multiply(qAfterNormal);

    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    mesh.quaternion.copy(quat);
  }
}
