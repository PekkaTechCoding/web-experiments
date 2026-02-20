import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MeshComponent, PhysicsComponent } from '../entity.js';

export class SkierController2 {
  constructor(world, {
    steerYawRate = 2.8,
    autoDownhillYawRate = 0.1,
    maxImpactSpeed = 6.0,
    maxImpactForce = 1000.0,
    forwardForce = 10.0,
    linearDrag = 0.4,
    lateralDrag = 6.0,
    turnDrag = 4.0,
    speedSteerDrop = 0.15,
    trailStampInterval = 2,
    boostSpeed = 18.0,
    jumpSpeed = 8.0,
    groundProbe = 0.20,
    smoothNormals = false,
    snowParticleInterval = 0.06,
  } = {}) {
    this.world = world;
    this.steerYawRate = steerYawRate;
    this.autoDownhillYawRate = autoDownhillYawRate;
    this.maxImpactSpeed = maxImpactSpeed;
    this.maxImpactForce = maxImpactForce;
    this.forwardForce = forwardForce;
    this.linearDrag = linearDrag;
    this.lateralDrag = lateralDrag;
    this.turnDrag = turnDrag;
    this.speedSteerDrop = speedSteerDrop;
    this.trailStampInterval = trailStampInterval;
    this.boostSpeed = boostSpeed;
    this.jumpSpeed = jumpSpeed;
    this.groundProbe = groundProbe;
    this.smoothNormals = smoothNormals;
    this.snowParticleInterval = snowParticleInterval;

    this.keys = new Set();
    this.boostRequested = false;
    this.prevYaw = null;
    this.trailStampFrame = 0;
    this.snowParticleTimer = 0;
    this.wasGrounded = false;
    this.prevVelocity = new THREE.Vector3();
    this.lastStampLeft = null;
    this.lastStampRight = null;
    this.onKeyDown = (e) => this.keys.add(e.code);
    this.onKeyUp = (e) => this.keys.delete(e.code);
  }

  onStart() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  onCollide(other, event) {
    if (!event?.contact) return;
    // const contact = event.contact;
    // const impact = Math.abs(contact.getImpactVelocityAlongNormal());
    // if (!Number.isFinite(impact) || impact <= this.maxImpactSpeed) return;

    // const scale = this.maxImpactSpeed / impact;
    // if (Number.isFinite(contact.maxForce)) {
    //   contact.maxForce = Math.min(contact.maxForce, this.maxImpactForce) * scale;
    // } else {
    //   contact.maxForce = this.maxImpactForce * scale;
    // }
    // contact.restitution = 0;
  }

  onDestroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  update(dt) {
    const body = this.entity.getComponent(PhysicsComponent.type).body;
    const mesh = this.entity.getComponent(MeshComponent.type).mesh;

    // a) Check ground contact
    const footOffset = body.userData?.footOffset ?? 0.95;
    const probeRadius = 0.2;
    const probeCount = 6;
    const normals = [];
    const hitPoints = [];

    for (let i = 0; i < probeCount; i++) {
      const angle = (i / probeCount) * Math.PI * 2;
      const ox = Math.cos(angle) * probeRadius;
      const oz = Math.sin(angle) * probeRadius;
      const from = new CANNON.Vec3(body.position.x + ox, body.position.y + footOffset, body.position.z + oz);
      const to = new CANNON.Vec3(body.position.x + ox, body.position.y - (footOffset + this.groundProbe), body.position.z + oz);
      const result = new CANNON.RaycastResult();
      const hasHit = this.world.physicsWorld.raycastClosest(from, to, {
        collisionFilterGroup: 2,
        collisionFilterMask: 1,
        skipBackfaces: true,
      }, result);
      if (hasHit && result.hasHit) {
        normals.push(new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z).normalize());
        hitPoints.push(new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z));
      }
    }

    let grounded = normals.length > 0;
    let normal = new THREE.Vector3(0, 1, 0);
    let hitPoint = null;
    if (grounded) {
      const avg = normals.reduce((acc, n) => acc.add(n), new THREE.Vector3()).normalize();
      const filtered = normals.filter((n) => n.dot(avg) > 0.7);
      const use = filtered.length > 0 ? filtered : normals;
      normal = use.reduce((acc, n) => acc.add(n), new THREE.Vector3()).normalize();
      hitPoint = hitPoints[0];
    }
    if (grounded && this.smoothNormals) {
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
    const worldUp = new THREE.Vector3(0, 1, 0);
    const alignNormal = grounded ? normal : worldUp;

    const v = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
    const vPlane = v.clone().sub(alignNormal.clone().multiplyScalar(v.dot(alignNormal)));
    const surfaceSpeed = vPlane.length();

    const currentQuat = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    const currentEuler = new THREE.Euler().setFromQuaternion(currentQuat, 'YXZ');
    let yaw = currentEuler.y;

    if (steer !== 0) {
      yaw += steer * this.steerYawRate * dt;
    } else if (grounded && surfaceSpeed > 0.01) {
      const downhill = new THREE.Vector3(0, -1, 0).projectOnPlane(alignNormal).normalize();
      if (downhill.lengthSq() > 1e-6) {
        const targetYaw = Math.atan2(-downhill.x, -downhill.z);
        let delta = targetYaw - yaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const maxTurn = this.autoDownhillYawRate * dt;
        yaw += THREE.MathUtils.clamp(delta, -maxTurn, maxTurn);
      }
    }

    const yawQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    body.quaternion.set(yawQuat.x, yawQuat.y, yawQuat.z, yawQuat.w);
    body.angularVelocity.set(0, 0, 0);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat).normalize();
    const up = worldUp.clone();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat).normalize();

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

    const lateralVec = forwardOnPlane.lengthSq() > 1e-6
      ? vPlane.clone().sub(forwardOnPlane.clone().multiplyScalar(vPlane.dot(forwardOnPlane)))
      : new THREE.Vector3();

    // Gameplay correction: resolve any ground penetration for the bottom sphere
    if (grounded && hitPoints.length > 0) {
      const bodyPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const footPos = bodyPos.clone().sub(alignNormal.clone().multiplyScalar(footOffset));
      let maxPenetration = 0;
      for (let i = 0; i < hitPoints.length; i++) {
        const pen = hitPoints[i].dot(alignNormal) - footPos.dot(alignNormal);
        if (pen > maxPenetration) maxPenetration = pen;
      }
      if (maxPenetration > 1e-4) {
        const correction = Math.min(maxPenetration, 0.5);
        body.position.x += alignNormal.x * correction;
        body.position.y += alignNormal.y * correction;
        body.position.z += alignNormal.z * correction;

        const vn = v.dot(alignNormal);
        if (vn < 0) {
          const vnVec = alignNormal.clone().multiplyScalar(vn);
          const vFixed = v.clone().sub(vnVec);
          body.velocity.x = vFixed.x;
          body.velocity.y = vFixed.y;
          body.velocity.z = vFixed.z;
        }
      }
    }

    if (!this.world.debug) this.world.debug = {};

    const debugForce = new THREE.Vector3();
    const debugTorque = new THREE.Vector3();

    // Debug: expose ground normal + forward velocity direction for physics debug view
    if (this.world.debug) {
      const arrowPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      // this.world.debug.groundNormal = { position: arrowPos, direction: normal.clone().normalize() };
      this.world.debug.groundNormal = { position: arrowPos, direction: alignNormal.clone().normalize() };

      const speed = v.length();
      const debugForwardScale = 0.25;
      const debugForwardMax = 6.0;
      const forwardLen = THREE.MathUtils.clamp(speed * debugForwardScale, 0, debugForwardMax);
      this.world.debug.forwardVelocity = {
        position: arrowPos,
        direction: forward.clone().normalize().multiplyScalar(forwardLen),
      };
      if (this.prevYaw == null || dt <= 1e-6) {
        this.world.debug.yawAngularVelocity = 0;
      } else {
        let dyaw = yaw - this.prevYaw;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        this.world.debug.yawAngularVelocity = dyaw / dt;
      }
    }

    // d) Rotation is driven directly by yaw, so torque debug is zero.

    if (grounded) {
      // f) Forward drive (french fries)
      if (forwardOnPlane.lengthSq() > 0.1) {
        const drive = forwardOnPlane.clone().multiplyScalar(this.forwardForce * body.mass);
        body.applyForce(new CANNON.Vec3(drive.x, drive.y, drive.z), body.position);
        if (this.world.debug) {
          this.world.debug.frenchFriesForce = {
            position: new THREE.Vector3(body.position.x, body.position.y, body.position.z),
            direction: drive.clone(),
          };
        }
        if (surfaceSpeed > 0.2) {
          this.trailStampFrame += 1;
          const shouldStamp = this.trailStampInterval <= 1 || (this.trailStampFrame % this.trailStampInterval === 0);
          if (shouldStamp) {
            const rightOnPlane = new THREE.Vector3().crossVectors(alignNormal, forwardOnPlane).normalize();
            const base = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
            const side = 0.3;
            const forwardOffset = 0.2;
            const leftPos = base.clone().add(forwardOnPlane.clone().multiplyScalar(forwardOffset)).add(rightOnPlane.clone().multiplyScalar(-side));
            const rightPos = base.clone().add(forwardOnPlane.clone().multiplyScalar(forwardOffset)).add(rightOnPlane.clone().multiplyScalar(side));
            this.world.trails?.stamp(leftPos.x, leftPos.z);
            this.world.trails?.stamp(rightPos.x, rightPos.z);
            this.world.deformationTexture?.stamp(leftPos.x, leftPos.z);
            this.world.deformationTexture?.stamp(rightPos.x, rightPos.z);
            if (this.wasGrounded && this.lastStampLeft && this.lastStampRight && this.world.stampTerrainSegment) {
              this.world.stampTerrainSegment(this.lastStampLeft.x, this.lastStampLeft.z, leftPos.x, leftPos.z, 1);
              this.world.stampTerrainSegment(this.lastStampRight.x, this.lastStampRight.z, rightPos.x, rightPos.z, 1);
            } else {
              this.world.stampTerrain?.(leftPos.x, leftPos.z, 1);
              this.world.stampTerrain?.(rightPos.x, rightPos.z, 1);
            }

            this.lastStampLeft = leftPos;
            this.lastStampRight = rightPos;
          }

          if (this.world.snowParticles) {
            const moveDir = vPlane.lengthSq() > 1e-6 ? vPlane.clone().normalize() : null;
            const alignDot = moveDir ? Math.abs(moveDir.dot(forwardOnPlane)) : 1;
            const sideAmount = 1 - alignDot;
            // const interval = THREE.MathUtils.lerp(0.12, 0.03, sideAmount);
            const pacing = Math.max(0, Math.min(1, surfaceSpeed / 10));
            const interval = (1 - pacing) * THREE.MathUtils.lerp(0.02, 0.01, sideAmount);
            const count = Math.round(THREE.MathUtils.lerp(3, 10, sideAmount));
            const spread = THREE.MathUtils.lerp(0.5, 0.9, sideAmount);

            this.snowParticleTimer += dt;
            if (this.snowParticleTimer >= interval) {
              this.snowParticleTimer -= interval;
              const rightOnPlane = new THREE.Vector3().crossVectors(alignNormal, forwardOnPlane).normalize();
              const base = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
                .sub(alignNormal.clone().multiplyScalar(footOffset * 0.95));
              const side = 0.48;
              const forwardOffset = 0.15;
              const leftPos = base.clone().add(forwardOnPlane.clone().multiplyScalar(forwardOffset)).add(rightOnPlane.clone().multiplyScalar(-side));
              const rightPos = base.clone().add(forwardOnPlane.clone().multiplyScalar(forwardOffset)).add(rightOnPlane.clone().multiplyScalar(side));
              const sprayDir = forwardOnPlane.lengthSq() > 1e-6
                ? forwardOnPlane.clone().multiplyScalar(-0.2).add(alignNormal.clone().multiplyScalar(0.7)).normalize()
                : alignNormal.clone();
              const speed = pacing * Math.min(4.0, Math.max(0.5, surfaceSpeed + 0.2));
              this.world.snowParticles.emit(leftPos, sprayDir, speed, spread, count);
              this.world.snowParticles.emit(rightPos, sprayDir, speed, spread, count);
            }
          }
        }
      }

      // Landing burst
      if (this.world.snowParticles && !this.wasGrounded) {
        const prevVN = this.prevVelocity.dot(alignNormal);
        const impact = Math.max(0, -prevVN);
        if (impact > 1.5) {
          const rightOnPlane = new THREE.Vector3().crossVectors(alignNormal, forwardOnPlane).normalize();
          const base = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
            .sub(alignNormal.clone().multiplyScalar(footOffset * 0.7));
          const side = 0.35;
          const forwardOffset = 0.1;
          const leftPos = base.clone().add(forwardOnPlane.clone().multiplyScalar(forwardOffset)).add(rightOnPlane.clone().multiplyScalar(-side));
          const rightPos = base.clone().add(forwardOnPlane.clone().multiplyScalar(forwardOffset)).add(rightOnPlane.clone().multiplyScalar(side));
          const burstDir = alignNormal.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 1, 0).multiplyScalar(0.4)).normalize();
          const burstSpeed = Math.min(4, 1 + impact * 0.6);
          const burstCount = Math.round(Math.min(20, 6 + impact * 3));
          this.world.snowParticles.emit(leftPos, burstDir, burstSpeed, 1.2, burstCount);
          this.world.snowParticles.emit(rightPos, burstDir, burstSpeed, 1.2, burstCount);
        }
      }

      // g) Drag / resistance
      const drag = vPlane.clone().multiplyScalar(-this.linearDrag * body.mass);
      body.applyForce(new CANNON.Vec3(drag.x, drag.y, drag.z), body.position);

      const lateralDrag = lateralVec.clone().multiplyScalar(-this.lateralDrag * body.mass);
      body.applyForce(new CANNON.Vec3(lateralDrag.x, lateralDrag.y, lateralDrag.z), body.position);

      if (Math.abs(steer) > 0.5) {
        const turnDrag = vPlane.clone().multiplyScalar(-this.turnDrag * body.mass * Math.abs(steer));
        body.applyForce(new CANNON.Vec3(turnDrag.x, turnDrag.y, turnDrag.z), body.position);
      }

      // h) Jump: set normal speed to jumpSpeed
      if (wantsJump) {
        const vNormal = Math.max(0, v.dot(alignNormal));
        const dv = Math.max(0, this.jumpSpeed - vNormal);
        if (dv > 0) {
          const impulse = alignNormal.clone().multiplyScalar(dv * body.mass);
          body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), body.position);
          if (dt > 1e-6) debugForce.add(impulse.clone().multiplyScalar(1 / dt));
        }
      }

      // i) Boost: set surface speed to boostSpeed
      if (wantsBoost) {
        this.boostRequested = false;
        if (forwardOnPlane.lengthSq() > 0.1) {
          const along = Math.max(0, vPlane.dot(forwardOnPlane));
          const dv = Math.max(0, this.boostSpeed - along);
          if (dv > 0) {
            const impulse = forwardOnPlane.clone().multiplyScalar(dv * body.mass);
            body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), body.position);
            if (dt > 1e-6) debugForce.add(impulse.clone().multiplyScalar(1 / dt));
          }
        }
      }
    }

    if (this.world.debug) {
      const basePos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const rightOffset = right.clone().multiplyScalar(0.6);
      const forcePos = basePos.clone().add(rightOffset).add(up.clone().multiplyScalar(0.2));
      const torquePos = basePos.clone().add(rightOffset).add(up.clone().multiplyScalar(-0.2));

      const forceMag = debugForce.length();
      const torqueMag = debugTorque.length();
      const forceScale = 0.05;
      const torqueScale = 0.1;
      const maxLen = 6.0;

      const forceLen = THREE.MathUtils.clamp(forceMag * forceScale, 0, maxLen);
      const torqueLen = THREE.MathUtils.clamp(torqueMag * torqueScale, 0, maxLen);
      // const torqueDir = forward.clone().multiplyScalar(5);// new THREE.Vector3(0, 0, -1);
      // const torqueLen = 5;

      const forceDir = forceMag > 1e-6
        ? debugForce.clone().multiplyScalar(forceLen / forceMag)
        : new THREE.Vector3();
      const torqueDir = torqueMag > 1e-6
        ? debugTorque.clone().multiplyScalar(torqueLen / torqueMag)
        : new THREE.Vector3();


      this.world.debug.sumForce = { position: forcePos, direction: forceDir, magnitude: forceMag };
      this.world.debug.sumTorque = { position: torquePos, direction: torqueDir, magnitude: torqueMag };
    }
    this.wantsJump = false;
    this.wantsBoost = false;
    this.prevYaw = yaw;
    if (!grounded) {
      this.lastStampLeft = null;
      this.lastStampRight = null;
    }
    this.wasGrounded = grounded;
    this.prevVelocity.set(body.velocity.x, body.velocity.y, body.velocity.z);

    // j) Visual sync (no direct rotation changes)
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}
