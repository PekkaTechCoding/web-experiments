import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Entity, MeshComponent, PhysicsComponent } from '../entity.js';

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
    jumpSpeed = 8.0,
    groundProbe = 0.20,
    smoothNormals = false,
    snowParticleInterval = 0.06,
    visualTiltRateGrounded = 8.0,
    visualTiltRateAir = 3.0,
    visualImpactThreshold = 1.5,
    visualImpactBoost = 1.2,
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
    this.jumpSpeed = jumpSpeed;
    this.jumpChargeTime = 0.6;
    this.jumpMaxMultiplier = 2.2;
    this.jumpHold = 0;
    this.wasJumpPressed = false;
    this.fallen = false;
    this.detachedSnowboard = null;
    this.groundProbe = groundProbe;
    this.smoothNormals = smoothNormals;
    this.snowParticleInterval = snowParticleInterval;
    this.visualTiltRateGrounded = visualTiltRateGrounded;
    this.visualTiltRateAir = visualTiltRateAir;
    this.visualImpactThreshold = visualImpactThreshold;
    this.visualImpactBoost = visualImpactBoost;

    this.keys = new Set();
    this.prevYaw = null;
    this.trailStampFrame = 0;
    this.snowParticleTimer = 0;
    this.wasGrounded = false;
    this.prevVelocity = new THREE.Vector3();
    this.lastStampLeft = null;
    this.lastStampRight = null;
    this.visualQuat = new THREE.Quaternion();
    this.onKeyDown = (e) => this.keys.add(e.code);
    this.onKeyUp = (e) => this.keys.delete(e.code);
  }

  onStart() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  onCollide(other, event) {
    if (this.fallen) return;
    if (!event?.contact) return;

    const otherBody = other?.getComponent?.(PhysicsComponent.type)?.body;
    const otherName = other?.name ?? '';
    const isTerrain = otherName.startsWith('terrain') || otherName === 'terrain';
    const isObstacle = otherBody && !isTerrain;
    if (!isObstacle) return;

    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal?.() ?? 0);

    if (this.world?.snowParticles) {
      const contact = event.contact;
      const point = new CANNON.Vec3();
      if (contact?.bi && contact?.ri) {
        contact.bi.position.vadd(contact.ri, point);
      }
      if (contact?.bj && contact?.rj) {
        const pointB = new CANNON.Vec3();
        contact.bj.position.vadd(contact.rj, pointB);
        point.x = (point.x + pointB.x) * 0.5;
        point.y = (point.y + pointB.y) * 0.5;
        point.z = (point.z + pointB.z) * 0.5;
      }
      if (!Number.isFinite(point.x)) {
        point.copy(event.body?.position ?? new CANNON.Vec3());
      }
      const burstPos = new THREE.Vector3(point.x, point.y, point.z);
      const speed = Math.min(4.5, Math.max(1.6, impact * 0.45));
      for (let i = 0; i < 3; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const dir = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
        ).normalize();
        this.world.snowParticles.emit(burstPos, dir, speed, 1.8, 14);
      }
    }

    if (impact >= 0.8) {
      this.triggerFall();
    }
  }

  triggerFall() {
    if (this.fallen) return;
    this.fallen = true;
    this.world?.setCameraFollowEnabled?.(false);
    const body = this.entity.getComponent(PhysicsComponent.type).body;
    body.angularFactor.set(1, 1, 1);
    body.angularDamping = 0.1;
    body.linearDamping = 0.02;
    const mesh = this.entity.getComponent(MeshComponent.type).mesh;
    const board = mesh.getObjectByName('snowboard');
    if (board) {
      mesh.remove(board);
      board.position.copy(mesh.position);
      board.quaternion.copy(mesh.quaternion);
      if (mesh.parent) {
        mesh.parent.add(board);
      } else if (this.world?.engine?.scene) {
        this.world.engine.scene.add(board);
      }

      const box = new THREE.Box3().setFromObject(board);
      const size = box.getSize(new THREE.Vector3());
      const half = new CANNON.Vec3(
        Math.max(0.2, size.x * 0.5),
        Math.max(0.05, size.y * 0.5),
        Math.max(0.1, size.z * 0.5),
      );
      const body = new CANNON.Body({
        mass: 1.2,
        shape: new CANNON.Box(half),
        position: new CANNON.Vec3(board.position.x, board.position.y, board.position.z),
        quaternion: new CANNON.Quaternion(board.quaternion.x, board.quaternion.y, board.quaternion.z, board.quaternion.w),
        material: this.world?.skierMat,
        linearDamping: 0.05,
        angularDamping: 0.2,
      });
      const skierBody = this.entity.getComponent(PhysicsComponent.type).body;
      body.velocity.set(skierBody.velocity.x, skierBody.velocity.y, skierBody.velocity.z);
      body.angularVelocity.set(skierBody.angularVelocity.x, skierBody.angularVelocity.y, skierBody.angularVelocity.z);

      const boardEntity = new Entity('snowboard');
      boardEntity.addComponent(new MeshComponent(board));
      boardEntity.addComponent(new PhysicsComponent(body));
      this.world?.engine?.addEntity(boardEntity);
      this.detachedSnowboard = boardEntity;
    }
  }

  onDestroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  update(dt) {
    const body = this.entity.getComponent(PhysicsComponent.type).body;
    const mesh = this.entity.getComponent(MeshComponent.type).mesh;

    if (this.fallen) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
      return;
    }

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
    const wantsBoost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.world?.input?.boost;

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
        const boostMult = wantsBoost ? 2.0 : 1.0;
        const drive = forwardOnPlane.clone().multiplyScalar(this.forwardForce * boostMult * body.mass);
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
            const forwardOffset = 0.55;
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
              const side = 0.28;
              const forwardOffset = 0.85;
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

      // h) Jump (charge + release)
      if (wantsJump) {
        this.jumpHold = Math.min(this.jumpChargeTime, this.jumpHold + dt);
      } else if (this.wasJumpPressed && grounded) {
        const chargeT = Math.min(1, this.jumpHold / Math.max(0.0001, this.jumpChargeTime));
        const targetSpeed = this.jumpSpeed * (1 + (this.jumpMaxMultiplier - 1) * chargeT);
        const vNormal = Math.max(0, v.dot(alignNormal));
        const dv = Math.max(0, targetSpeed - vNormal);
        if (dv > 0) {
          const impulse = alignNormal.clone().multiplyScalar(dv * body.mass);
          body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), body.position);
          if (dt > 1e-6) debugForce.add(impulse.clone().multiplyScalar(1 / dt));
        }
        this.jumpHold = 0;
      }
      this.wasJumpPressed = wantsJump;
      if (!wantsJump && !grounded) {
        this.jumpHold = 0;
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

    // j) Visual sync with smoothed terrain tilt.
    let visualTarget = yawQuat.clone();
    if (forwardOnPlane.lengthSq() > 1e-6) {
      const back = forwardOnPlane.clone().multiplyScalar(-1);
      const rightOnPlane = new THREE.Vector3().crossVectors(alignNormal, back);
      if (rightOnPlane.lengthSq() > 1e-8) {
        rightOnPlane.normalize();
        const tiltMatrix = new THREE.Matrix4().makeBasis(
          rightOnPlane,
          alignNormal.clone().normalize(),
          back.clone().normalize(),
        );
        visualTarget.setFromRotationMatrix(tiltMatrix);
      }
    }

    if (this.visualQuat.lengthSq() < 1e-8) {
      this.visualQuat.copy(mesh.quaternion);
    }

    let landingImpact = 0;
    if (grounded && !this.wasGrounded) {
      const prevVN = this.prevVelocity.dot(alignNormal);
      landingImpact = Math.max(0, -prevVN);
    }
    const impactBoost = Math.max(0, landingImpact - this.visualImpactThreshold) * this.visualImpactBoost;
    const baseRate = grounded ? this.visualTiltRateGrounded : this.visualTiltRateAir;
    const smoothRate = baseRate + impactBoost;
    const alpha = 1 - Math.exp(-Math.max(0, smoothRate) * Math.max(0, dt));
    this.visualQuat.slerp(visualTarget, THREE.MathUtils.clamp(alpha, 0, 1));

    mesh.position.copy(body.position);
    mesh.quaternion.copy(this.visualQuat);
  }
}
