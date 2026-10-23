// js/player.js
import * as THREE from 'three';
import { SFX } from './audio.js';
import { ABILITIES } from './abilities.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;

    this.pos = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.radius = 0.36;
    this.standHeight = 1.8;
    this.slideHeight = 0.95;
    this.height = this.standHeight;
    this.eyeStand = 1.62;
    this.eyeSlide = 0.72;
    this.eye = this.eyeStand;

    this.keys = { fwd: false, back: false, left: false, right: false, sprint: false, slide: false };

    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.jumpCutDone = false;

    this.sliding = false;
    this.slideTimer = 0;

    this.wallRunning = false;
    this.wallTimer = 0;
    this.wallNormal = new THREE.Vector3(1, 0, 0);
    this.wallCool = 0;

    this.airJumps = 0;
    this.slamming = false;

    this.cooldowns = {};
    this.abilities = ['dash', null];

    this.grapple = { active: false, anchor: null, length: 0 };
    this.aimAnchor = null;

    this.camRoll = 0;
    this.camShake = 0;
    this.camDip = 0;
    this.landTimer = 0;

    this.dead = false;
    this.travelled = 0;

    this.resetStats();
  }

  /* ------------------------------------------------------------------ */
  resetStats() {
    this.stats = {
      walkSpeed: 7.2,
      sprintSpeed: 11.5,
      groundAccel: 78,
      airAccel: 62,
      friction: 8.2,
      jumpVel: 8.8,
      gravity: 26,
      maxFall: 62,
      maxAirJumps: 0,
      stepHeight: 0.62,
      vaultSpeed: 7.5,
      dashCooldown: 1.5,
      dashPower: 15.5,
      maxSpeedHard: 34,
      slideFriction: 1.9,
      slideBoost: 2.0,
      wallRunTime: 1.4,
      wallRunGravity: 0.13,
      grappleRange: 32,
      grapplePull: 26,
      grappleReel: 5,
      swingDamping: 1.0,
      landRetain: 0.82,
      maxHealth: 100,
      maxHeals: 1,
      healAmount: 40,
      blinkRange: 9,
      rebound: false,
      reboundPower: 11
    };
    this.health = this.stats.maxHealth;
    this.heals = this.stats.maxHeals;
    this.cooldowns = { dash: 0, slam: 0, blink: 0 };
    this.abilities = ['dash', null];
  }

  grantAbility(id) {
    if (this.abilities.includes(id)) return;
    const empty = this.abilities.indexOf(null);
    if (empty >= 0) this.abilities[empty] = id;
    else this.abilities[1] = id;
  }

  /* ------------------------------------------------------------------ */
  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw ?? 0;
    this.pitch = 0;
    this.height = this.standHeight;
    this.eye = this.eyeStand;
    this.sliding = false;
    this.wallRunning = false;
    this.wallTimer = 0;
    this.airJumps = this.stats.maxAirJumps;
    this.slamming = false;
    this.dead = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.camRoll = 0;
    this.camShake = 0;
    this.camDip = 0;
    this.releaseGrapple(false);
    this.health = this.stats.maxHealth;
    this.heals = this.stats.maxHeals;
    this.cooldowns = { dash: 0, slam: 0, blink: 0 };
    this.aimAnchor = null;
  }

  /* ------------------------------------------------------------------ */
  getLookDir() {
    return _v1.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).clone().normalize();
  }

  getMoveDir3D() {
    const dir = new THREE.Vector3();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.keys.fwd) dir.add(fwd);
    if (this.keys.back) dir.sub(fwd);
    if (this.keys.right) dir.add(right);
    if (this.keys.left) dir.sub(right);
    if (dir.lengthSq() > 0.0001) dir.normalize();
    // Include pitch when airborne so dashes can go up/down
    if (!this.grounded && dir.lengthSq() > 0.0001) {
      const look = this.getLookDir();
      const vertical = Math.max(-0.6, Math.min(0.6, look.y));
      dir.y = vertical;
      dir.normalize();
    }
    return dir;
  }

  getHorizontalSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /* ------------------------------------------------------------------ */
  collidesAt(px, py, pz, height) {
    const r = this.radius;
    const minx = px - r, maxx = px + r;
    const miny = py + 0.001, maxy = py + height - 0.001;
    const minz = pz - r, maxz = pz + r;
    const cols = this.game.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.trigger || c.disabled) continue;
      if (maxx <= c.min.x || minx >= c.max.x) continue;
      if (maxy <= c.min.y || miny >= c.max.y) continue;
      if (maxz <= c.min.z || minz >= c.max.z) continue;
      return c;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  moveAxis(axis, amount) {
    if (Math.abs(amount) < 1e-8) return null;
    const p = _v2.copy(this.pos);
    p[axis] += amount;

    for (let iter = 0; iter < 4; iter++) {
      const c = this.collidesAt(p.x, p.y, p.z, this.height);
      if (!c) break;

      if (axis !== 'y') {
        // Step-up / vault
        const stepUp = c.max.y - this.pos.y;
        const maxStep = this.grounded ? this.stats.stepHeight : 0.12;
        const canVault = this.getHorizontalSpeed() > this.stats.vaultSpeed && stepUp <= 1.25;
        if (stepUp > 0.001 && (stepUp <= maxStep || canVault)) {
          if (!this.collidesAt(p.x, c.max.y + 0.002, p.z, this.height)) {
            p.y = c.max.y + 0.002;
            continue;
          }
        }
        // Push out
        const r = this.radius;
        if (axis === 'x') p.x = amount > 0 ? c.min.x - r - 0.002 : c.max.x + r + 0.002;
        else p.z = amount > 0 ? c.min.z - r - 0.002 : c.max.z + r + 0.002;
        break;
      } else {
        if (amount < 0) {
          p.y = c.max.y + 0.002;
          this.grounded = true;
        } else {
          p.y = c.min.y - this.height - 0.002;
        }
        break;
      }
    }

    const moved = p.clone().sub(this.pos);
    this.pos.copy(p);
    return moved;
  }

  /* ------------------------------------------------------------------ */
  update(dt) {
    const steps = Math.min(5, Math.max(1, Math.ceil(dt / (1 / 120))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h);

    // Cooldowns
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    this.updateCamera(dt);
  }

  /* ------------------------------------------------------------------ */
  step(h) {
    const st = this.stats;

    // ---- timers ----
    if (this.grounded) this.coyote = 0.12;
    else this.coyote = Math.max(0, this.coyote - h);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - h);
    this.wallCool = Math.max(0, this.wallCool - h);

    const wish = new THREE.Vector3();
    {
      const fwd = _v3.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (this.keys.fwd) wish.add(fwd);
      if (this.keys.back) wish.sub(fwd);
      if (this.keys.right) wish.add(right);
      if (this.keys.left) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();
    }

    // ---- slide state ----
    if (!this.sliding && this.keys.slide && this.grounded && this.getHorizontalSpeed() > 3.2 && this.coyote > 0) {
      this.startSlide();
    }
    if (this.sliding) {
      this.slideTimer += h;
      if (!this.keys.slide || this.getHorizontalSpeed() < 3.0 || (!this.grounded && this.slideTimer > 0.25)) {
        if (!this.keys.slide || this.getHorizontalSpeed() < 3.0) this.endSlide();
      }
    }
    if (this.keys.slide && !this.sliding && this.grounded) {
      // crouch height even when stationary
      this.setHeight(this.slideHeight);
    } else if (!this.sliding && !this.keys.slide) {
      this.setHeight(this.standHeight);
    }

    // ---- grapple ----
    if (this.grapple.active) this.updateGrapple(h);

    // ---- ground / air acceleration ----
    const speed = this.getHorizontalSpeed();
    const targetSpeed = this.keys.sprint ? st.sprintSpeed : st.walkSpeed;

    if (this.grounded && !this.wallRunning) {
      // friction
      if (speed > 0.01) {
        let fr = this.sliding ? st.slideFriction : st.friction;
        if (speed > targetSpeed * 1.05) fr *= 0.32; // preserve injected momentum
        if (this.sliding) fr *= 0.55;
        const drop = speed * fr * h;
        const ns = Math.max(0, speed - drop);
        const s = ns / speed;
        this.vel.x *= s; this.vel.z *= s;
      }
      // acceleration
      if (wish.lengthSq() > 0.001) {
        const cur = this.vel.x * wish.x + this.vel.z * wish.z;
        const add = targetSpeed - cur;
        if (add > 0) {
          const accel = Math.min(st.groundAccel * h * (this.sliding ? 0.25 : 1), add);
          this.vel.x += wish.x * accel;
          this.vel.z += wish.z * accel;
        }
      }
    } else if (!this.wallRunning) {
      // air control (Quake-style accel keeps momentum but rewards skill)
      if (wish.lengthSq() > 0.001) {
        const cur = this.vel.x * wish.x + this.vel.z * wish.z;
        const add = Math.max(0, Math.min(st.sprintSpeed, 12) - cur);
        if (add > 0) {
          const accel = Math.min(st.airAccel * h * 0.5, add);
          this.vel.x += wish.x * accel;
          this.vel.z += wish.z * accel;
        }
      }
    }

    // ---- gravity ----
    const gravScale = this.wallRunning ? st.wallRunGravity : 1;
    this.vel.y -= st.gravity * gravScale * h;
    if (this.grapple.active) this.vel.y -= st.gravity * 0.35 * h; // reduced gravity while grappling
    if (this.vel.y < -st.maxFall) this.vel.y = -st.maxFall;

    // ---- wall run maintenance ----
    if (this.wallRunning) {
      this.wallTimer -= h;
      if (this.wallTimer <= 0 || this.grounded) {
        this.wallRunning = false;
        this.wallCool = 0.35;
      }
    }

    // ---- integrate with collision ----
    this.grounded = false;
    const hSpeedBefore = this.getHorizontalSpeed();

    const mvX = this.moveAxis('x', this.vel.x * h);
    if (mvX) {
      const blockedX = Math.abs(mvX.x) < Math.abs(this.vel.x * h) - 1e-5;
      if (blockedX) {
        this.tryStartWallRun(new THREE.Vector3(-Math.sign(this.vel.x), 0, 0), hSpeedBefore);
        this.vel.x *= -0.02;
      }
    }

    const mvZ = this.moveAxis('z', this.vel.z * h);
    if (mvZ) {
      const blockedZ = Math.abs(mvZ.z) < Math.abs(this.vel.z * h) - 1e-5;
      if (blockedZ) {
        this.tryStartWallRun(new THREE.Vector3(0, 0, -Math.sign(this.vel.z)), hSpeedBefore);
        this.vel.z *= -0.02;
      }
    }

    const wasAirborne = !this.grounded;
    const vyBefore = this.vel.y;
    const mvY = this.moveAxis('y', this.vel.y * h);
    if (mvY && Math.abs(mvY.y) < Math.abs(this.vel.y * h) - 1e-5) {
      if (this.vel.y <= 0) {
        this.onLand(-vyBefore);
      } else {
        this.vel.y = 0; // head bump
      }
    }

    // Ground snap (prevents bouncing down small steps)
    if (!this.grounded && this.vel.y <= 0.01 && this.coyote > 0) {
      const c = this.collidesAt(this.pos.x, this.pos.y - 0.35, this.pos.z, this.height);
      if (c && this.pos.y - c.max.y < 0.35) {
        this.pos.y = c.max.y + 0.002;
        this.vel.y = 0;
        this.grounded = true;
      }
    }

    if (this.grounded) {
      this.airJumps = 0;
      if (this.wallRunning) this.wallRunning = false;
      this.slamming = false;
    }

    // ---- jump resolution ----
    if (this.jumpBuffer > 0) {
      if (this.grounded || this.coyote > 0) {
        this.doJump(st.jumpVel);
        this.coyote = 0;
      } else if (this.wallRunning) {
        this.doWallJump();
      } else if (this.airJumps < st.maxAirJumps) {
        this.airJumps++;
        this.vel.y = st.jumpVel * 0.92;
        this.jumpBuffer = 0;
        this.jumpCutDone = false;
        SFX.doubleJump();
        this.game.puff(this.pos, 0x35e6ff, 8);
      }
    }

    // variable jump cut
    if (!this.jumpHeld && !this.jumpCutDone && this.vel.y > 3.5) {
      this.vel.y *= 0.55;
      this.jumpCutDone = true;
    }

    // track distance for stats
    this.travelled += this.getHorizontalSpeed() * h;
  }

  setHeight(h) {
    if (h === this.height) return;
    if (h > this.height) {
      if (this.collidesAt(this.pos.x, this.pos.y, this.pos.z, h)) return;
    }
    this.height = h;
  }

  startSlide() {
    this.sliding = true;
    this.slideTimer = 0;
    this.setHeight(this.slideHeight);
    const sp = this.getHorizontalSpeed();
    if (sp > 0.5) {
      const target = Math.max(sp * 1.06, 10 + this.stats.slideBoost);
      const scale = Math.min(target / sp, 1.6);
      this.vel.x *= scale;
      this.vel.z *= scale;
    }
    SFX.slide();
    this.game.puff(this.pos, 0x7fa8ff, 8);
  }

  endSlide() {
    this.sliding = false;
    if (!this.collidesAt(this.pos.x, this.pos.y, this.pos.z, this.standHeight)) {
      this.height = this.standHeight;
    }
  }

  doJump(vel) {
    this.vel.y = vel;
    this.grounded = false;
    this.jumpBuffer = 0;
    this.jumpCutDone = false;
    this.coyote = 0;
    SFX.jump();
    this.game.puff(this.pos, 0x9fe8ff, 7);
  }

  doWallJump() {
    const n = this.wallNormal;
    this.vel.x += n.x * 8.5;
    this.vel.z += n.z * 8.5;
    this.vel.y = this.stats.jumpVel * 0.98;
    this.wallRunning = false;
    this.wallCool = 0.25;
    this.jumpBuffer = 0;
    this.jumpCutDone = false;
    this.camShake = Math.max(this.camShake, 0.3);
    SFX.jump();
    this.game.puff(this.pos, 0x35e6ff, 10);
  }

  tryStartWallRun(normal, speed) {
    if (this.grounded || this.wallRunning || this.wallCool > 0) return;
    if (speed < 5.5) return;
    if (this.vel.y < -14) return;
    this.wallRunning = true;
    this.wallTimer = this.stats.wallRunTime;
    this.wallNormal.copy(normal).setY(0).normalize();
    if (this.vel.y < 0) this.vel.y *= 0.4;
    this.airJumps = 0;
    SFX.wallrun();
  }

  onLand(impactSpeed) {
    const wasSliding = this.sliding;
    this.vel.y = 0;
    this.grounded = true;
    this.airJumps = 0;

    if (impactSpeed > 7) {
      this.landTimer = 0.18;
      this.camDip = Math.min(0.42, impactSpeed * 0.016);
      this.camShake = Math.min(0.7, impactSpeed * 0.025);
      SFX.land();
      this.game.puff(this.pos, 0x8fb6cc, 10);
    }

    if (this.slamming) {
      this.slamming = false;
      if (this.stats.rebound) {
        this.vel.y = this.stats.reboundPower;
        this.grounded = false;
        this.game.puff(this.pos, 0xff7a3d, 20);
      } else {
        this.game.puff(this.pos, 0xff7a3d, 14);
      }
    }

    // Preserve horizontal momentum (design rule: never arbitrarily reset)
    if (!wasSliding) {
      const retain = Math.min(1, this.stats.landRetain + (impactSpeed < 16 ? 0.1 : 0));
      this.vel.x *= retain;
      this.vel.z *= retain;
    }
  }

  /* ------------------------------------------------------------------ */
  updateGrapple(h) {
    const a = this.grapple.anchor;
    if (!a) return;
    const eyePos = new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
    const d = new THREE.Vector3().subVectors(a.pos, eyePos);
    const dist = d.length();
    if (dist < 0.6) { this.releaseGrapple(false); return; }
    const dir = d.clone().multiplyScalar(1 / dist);

    // Pull force
    const pull = this.stats.grapplePull * (this.keys.fwd ? 1.0 : 0.6);
    this.vel.addScaledVector(dir, pull * h);

    // Rope constraint (swing)
    if (dist > this.grapple.length) {
      const overshoot = dist - this.grapple.length;
      const newPos = this.pos.clone().addScaledVector(dir, overshoot);
      if (!this.collidesAt(newPos.x, newPos.y, newPos.z, this.height)) {
        this.pos.copy(newPos);
      }
      const radial = this.vel.dot(dir);
      if (radial < 0) {
        this.vel.addScaledVector(dir, -radial * (1 - 0.25 * this.stats.swingDamping));
      }
    }

    // Reel in
    this.grapple.length = Math.max(4, this.grapple.length - this.stats.grappleReel * h);
  }

  findAimAnchor() {
    if (!this.game.anchors || this.game.anchors.length === 0) return null;
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
    const look = this.getLookDir();
    let best = null, bestScore = -1;
    for (const a of this.game.anchors) {
      const d = new THREE.Vector3().subVectors(a.pos, eye);
      const dist = d.length();
      if (dist > this.stats.grappleRange || dist < 1.5) continue;
      d.multiplyScalar(1 / dist);
      const dot = d.dot(look);
      if (dot < 0.5) continue;
      const score = dot - dist / (this.stats.grappleRange * 5);
      if (score > bestScore && this.hasLineOfSight(eye, a.pos)) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  hasLineOfSight(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.multiplyScalar(1 / dist);
    const cols = this.game.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.trigger) continue;
      if (this.rayBox(from, dir, c, dist)) return false;
    }
    return true;
  }

  rayBox(o, d, box, maxDist) {
    let tmin = 0, tmax = maxDist;
    for (const ax of ['x', 'y', 'z']) {
      const inv = 1 / (d[ax] || 1e-9);
      let t1 = (box.min[ax] - o[ax]) * inv;
      let t2 = (box.max[ax] - o[ax]) * inv;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    return tmax > 0.4;
  }

  tryGrapple() {
    if (this.grapple.active) return;
    const a = this.aimAnchor || this.findAimAnchor();
    if (!a) return;
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
    this.grapple.active = true;
    this.grapple.anchor = a;
    this.grapple.length = Math.max(4, a.pos.distanceTo(eye));
    this.airJumps = 0;
    this.wallRunning = false;
    SFX.grapple();
    this.game.puff(a.pos, 0xffd24a, 10);
  }

  releaseGrapple(withSound = true) {
    if (!this.grapple.active) return;
    this.grapple.active = false;
    this.grapple.anchor = null;
    if (withSound) SFX.release();
  }

  useAbilitySlot(slot) {
    const id = this.abilities[slot];
    if (!id) return;
    const ab = ABILITIES[id];
    if (!ab || !ab.ready(this)) return;
    ab.use(this);
  }

  heal() {
    if (this.heals <= 0) return;
    if (this.health >= this.stats.maxHealth) return;
    this.heals--;
    this.health = Math.min(this.stats.maxHealth, this.health + this.stats.healAmount);
    this.vel.y = Math.max(this.vel.y, 0) + 7.5;
    this.grounded = false;
    SFX.heal();
    this.game.puff(this.pos, 0x5affc8, 14);
  }

  damage(amount) {
    this.health -= amount;
    this.camShake = Math.max(this.camShake, 0.6);
    if (this.health <= 0) {
      this.health = 0;
      this.game.onPlayerDeath();
    }
  }

  /* ------------------------------------------------------------------ */
  updateCamera(dt) {
    const cam = this.game.camera;
    const fx = this.game.settings.cameraFx;

    const targetEye = this.sliding ? this.eyeSlide : this.eyeStand;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 14);

    this.landTimer = Math.max(0, this.landTimer - dt);
    this.camDip += (0 - this.camDip) * Math.min(1, dt * 9);
    this.camShake *= Math.pow(0.0015, dt);

    // Camera roll for wall-runs and strafing
    let targetRoll = 0;
    if (this.wallRunning) targetRoll = this.wallNormal.x > 0 ? -0.12 : 0.12;
    else if (this.grapple.active) targetRoll = 0.05;
    if (!fx) targetRoll = 0;
    this.camRoll += (targetRoll - this.camRoll) * Math.min(1, dt * 7);

    const shakeAmt = fx ? this.camShake : 0;
    const sx = (Math.random() - 0.5) * shakeAmt * 0.13;
    const sy = (Math.random() - 0.5) * shakeAmt * 0.13;

    cam.position.set(
      this.pos.x + sx,
      this.pos.y + this.eye - this.camDip + sy,
      this.pos.z
    );
    cam.rotation.set(this.pitch, this.yaw, this.camRoll, 'YXZ');

    // FOV: speed feedback, subtle
    const speed = this.vel.length();
    const base = this.game.settings.fov;
    const fovTarget = base + (fx ? Math.min(16, Math.max(0, (speed - 8) * 0.85)) : 0);
    cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 5);
    cam.updateProjectionMatrix();
  }
}
