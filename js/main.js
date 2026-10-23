// js/main.js
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { Player } from './player.js';
import { buildCourse } from './level.js';
import { UI } from './ui.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { initAudio, resumeAudio, setVolume, SFX } from './audio.js';
import { rollUpgrades, UPGRADES } from './upgrades.js';
import { ABILITIES } from './abilities.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.engine = createEngine(this.canvas);
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;

    this.save = loadSave();
    this.settings = this.save.settings;
    if (!Array.isArray(this.save.unlockedAbilities)) this.save.unlockedAbilities = ['dash'];

    this.abilityDefs = { ABILITIES };

    this.colliders = [];
    this.anchors = [];
    this.checkpoints = [];
    this.course = null;
    this.courseGroup = null;

    this.player = new Player(this);
    this.ui = new UI(this);

    this.state = 'menu';
    this.run = null;
    this.stageTime = 0;
    this.dt = 0;
    this.lastCheckpoint = 0;
    this.checkpointSplits = [];
    this.timerStarted = false;
    this.deathCount = 0;
    this.penaltyTime = 0;

    this.fx = [];
    this.applyVolume();
    this.engine.setQuality(this.settings.quality);
    this.ui.updateMenuMeta(this.save);
    this.ui.showScreen('menu');
    this.ui.showHud(false);

    this.bindEvents();
    this.clock = new THREE.Clock();
    this.loop();
  }

  /* ------------------------------------------------------------------ */
  bindEvents() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== this.canvas) return;
      const sens = 0.0022 * this.settings.sensitivity;
      this.player.yaw -= e.movementX * sens;
      this.player.pitch -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.02;
      this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
      if (this.state === 'playing' && e.button === 0) {
        // left click is not bound to anything destructive
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
        this.pause();
      }
    });

    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
  }

  onKeyDown(e) {
    const code = e.code;

    if (code === 'Escape') {
      if (this.state === 'playing') { this.pause(); return; }
      if (this.state === 'paused') { this.resume(); return; }
    }

    if (this.state === 'results' && code === 'Enter') {
      this.continueFromResults();
      return;
    }

    if (this.state !== 'playing') return;

    const k = this.player.keys;
    switch (code) {
      case 'KeyW': case 'ArrowUp': k.fwd = true; break;
      case 'KeyS': case 'ArrowDown': k.back = true; break;
      case 'KeyA': case 'ArrowLeft': k.left = true; break;
      case 'KeyD': case 'ArrowRight': k.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': k.sprint = true; break;
      case 'ControlLeft': case 'ControlRight': k.slide = true; break;
      case 'Space':
        e.preventDefault();
        this.player.jumpBuffer = 0.14;
        this.player.jumpHeld = true;
        this.player.jumpCutDone = false;
        break;
      case 'KeyE':
        if (!this.player.grapple.active) this.player.tryGrapple();
        break;
      case 'KeyQ': this.player.useAbilitySlot(0); break;
      case 'KeyR': this.player.useAbilitySlot(1); break;
      case 'KeyF': this.player.heal(); break;
    }
    if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ControlLeft'].includes(code)) {
      if (!this.timerStarted) this.startTimer();
    }
  }

  onKeyUp(e) {
    const code = e.code;
    const k = this.player.keys;
    switch (code) {
      case 'KeyW': case 'ArrowUp': k.fwd = false; break;
      case 'KeyS': case 'ArrowDown': k.back = false; break;
      case 'KeyA': case 'ArrowLeft': k.left = false; break;
      case 'KeyD': case 'ArrowRight': k.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': k.sprint = false; break;
      case 'ControlLeft': case 'ControlRight': k.slide = false; break;
      case 'Space': this.player.jumpHeld = false; break;
      case 'KeyE': this.player.releaseGrapple(); break;
    }
  }

  /* ------------------------------------------------------------------ */
  startTimer() {
    if (this.timerStarted) return;
    this.timerStarted = true;
    this.ui.showToast('GO', 900);
  }

  clearInput() {
    const k = this.player.keys;
    k.fwd = k.back = k.left = k.right = k.sprint = k.slide = false;
    this.player.jumpHeld = false;
  }

  /* ------------------------------------------------------------------ */
  /* RUN LIFECYCLE                                                       */
  /* ------------------------------------------------------------------ */
  startRun() {
    initAudio();
    resumeAudio();

    this.run = {
      stageIndex: 0,
      stageCount: 3,
      totalTime: 0,
      upgrades: [],
      stageTimes: [],
      creditsEarned: 0
    };
    this.player.resetStats();
    this.loadStage(0);
  }

  resumeRun() {
    if (!this.run) return;
    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.state = 'playing';
    this.canvas.requestPointerLock();
  }

  loadStage(index) {
    this.run.stageIndex = index;

    // Rebuild stats from base and re-apply all run upgrades
    this.player.resetStats();
    for (const id of this.run.upgrades) {
      const u = UPGRADES.find(x => x.id === id);
      if (u) u.apply(this.player);
    }

    // Tear down previous course
    if (this.courseGroup) {
      this.scene.remove(this.courseGroup);
      this.courseGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose?.();
      });
      this.courseGroup = null;
    }

    this.course = buildCourse(index);
    this.courseGroup = this.course.group;
    this.scene.add(this.courseGroup);

    this.colliders = this.course.colliders;
    this.anchors = this.course.anchors;
    this.checkpoints = this.course.checkpoints;
    this.checkpoints.forEach(c => { c.reached = c.isStart; });

    this.player.reset(this.course.start.pos, this.course.start.yaw);
    this.lastCheckpoint = 0;
    this.checkpointSplits = [];
    this.stageTime = 0;
    this.penaltyTime = 0;
    this.deathCount = 0;
    this.timerStarted = false;

    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.ui.showToast(`STAGE ${index + 1}`, 1200);
    this.state = 'playing';
    this.clearInput();

    this.canvas.requestPointerLock();

    // Update lights to follow immediately
    this.engine.sun.position.set(this.player.pos.x + 28, this.player.pos.y + 55, this.player.pos.z + 18);
    this.engine.sun.target.position.copy(this.player.pos);
  }

  restartStage() {
    if (!this.run) return;
    const idx = this.run.stageIndex;
    // Roll back the time already banked for this stage (it was never banked)
    this.loadStage(idx);
  }

  retryStage() {
    if (!this.run) {
      this.startRun();
      return;
    }
    this.loadStage(this.run.stageIndex);
  }

  abandonRun() {
    this.run = null;
    this.state = 'menu';
    this.ui.showHud(false);
    this.ui.showScreen('menu');
    this.ui.updateMenuMeta(this.save);
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.courseGroup) {
      this.scene.remove(this.courseGroup);
      this.courseGroup = null;
    }
    this.colliders = [];
    this.anchors = [];
  }

  toHub() {
    this.run = null;
    this.state = 'menu';
    this.ui.showHud(false);
    this.ui.showScreen('menu');
    this.ui.updateMenuMeta(this.save);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  continueFromResults() {
    if (!this.run) { this.toHub(); return; }
    if (this.run.stageIndex + 1 >= this.run.stageCount) {
      this.finishRun();
    } else {
      this.showUpgradeScreen();
    }
  }

  /* ------------------------------------------------------------------ */
  showUpgradeScreen() {
    this.state = 'upgrade';
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showHud(false);

    const taken = this.run.upgrades.slice();
    const choices = rollUpgrades(3, taken);
    this.ui.showUpgradeChoices(choices, (u) => {
      this.run.upgrades.push(u.id);
      u.apply(this.player);
      if (u.id === 'slamUnlock' || u.id === 'blinkUnlock' || u.id === 'slamRebound') {
        this.save.unlockedAbilities = Array.from(new Set([...this.save.unlockedAbilities, u.id === 'blinkUnlock' ? 'blink' : 'slam']));
        writeSave(this.save);
      }
      this.loadStage(this.run.stageIndex + 1);
    });
  }

  /* ------------------------------------------------------------------ */
  onFinishReached() {
    if (this.state !== 'playing') return;
    this.state = 'results';
    this.clearInput();
    this.player.releaseGrapple(false);
    if (document.pointerLockElement) document.exitPointerLock();

    const time = this.stageTime + this.penaltyTime;
    const idx = this.run.stageIndex;

    // Medals
    const par = this.course.parTime;
    let medal = '—', medalRank = 0;
    if (time <= par) { medal = 'GOLD'; medalRank = 3; }
    else if (time <= par * 1.3) { medal = 'SILVER'; medalRank = 2; }
    else if (time <= par * 1.7) { medal = 'BRONZE'; medalRank = 1; }

    // Records
    const prevBest = this.save.stageBests[idx] || null;
    const isBest = !prevBest || time < prevBest;
    if (isBest) this.save.stageBests[idx] = time;

    const credits = 20 + medalRank * 25 + (this.deathCount === 0 ? 15 : 0);
    this.save.credits += credits;
    this.run.creditsEarned += credits;
    this.run.totalTime += time;
    this.run.stageTimes.push(time);
    writeSave(this.save);

    const final = idx + 1 >= this.run.stageCount;

    SFX.finish();
    this.ui.showHud(false);
    this.ui.showResults({
      title: final ? 'STAGE CLEARED' : `STAGE ${idx + 1} COMPLETE`,
      time,
      best: prevBest,
      medal,
      credits,
      final,
      splits: this.checkpointSplits
    });
  }

  finishRun() {
    const total = this.run.totalTime;
    const prev = this.save.bestRun;
    if (!prev || total < prev) this.save.bestRun = total;
    this.save.runsCompleted = (this.save.runsCompleted || 0) + 1;
    this.save.credits += 60;
    writeSave(this.save);

    this.ui.showResults({
      title: 'RUN COMPLETE',
      time: total,
      best: prev,
      medal: !prev || total < prev ? 'NEW RECORD' : '—',
      credits: 60,
      final: true,
      splits: this.run.stageTimes.map((t, i) => ({ label: `STAGE ${i + 1}`, time: t }))
    });
    this.state = 'results';
    this.run = null;
    this.ui.updateMenuMeta(this.save);
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    SFX.death();
    this.respawn(true);
  }

  respawn(penalty) {
    const cp = this.checkpoints[this.lastCheckpoint] || this.checkpoints[0];
    const pos = cp.pos.clone();
    pos.y += 0.1;
    this.player.reset(pos, 0);
    this.player.resetStats();
    for (const id of this.run.upgrades) {
      const u = UPGRADES.find(x => x.id === id);
      if (u) u.apply(this.player);
    }
    this.player.reset(pos, 0);
    if (penalty) {
      this.penaltyTime += 2;
      this.deathCount++;
      this.ui.showToast('+2.000s PENALTY', 1200);
    }
  }

  /* ------------------------------------------------------------------ */
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showHud(false);
    this.ui.showScreen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.canvas.requestPointerLock();
  }

  /* ------------------------------------------------------------------ */
  persistSettings() {
    this.save.settings = this.settings;
    writeSave(this.save);
  }

  applyVolume() {
    initAudio();
    setVolume(this.settings.volume);
  }

  resetSave() {
    clearSave();
    this.save = loadSave();
    this.settings = this.save.settings;
    this.ui.applySettingsToUI();
    this.ui.updateMenuMeta(this.save);
    this.engine.setQuality(this.settings.quality);
    this.applyVolume();
  }

  /* ------------------------------------------------------------------ */
  puff(pos, color, count = 10) {
    const geo = new THREE.SphereGeometry(0.09, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0.4 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.6
      ));
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 6
      );
      this.scene.add(m);
      this.fx.push({ mesh: m, vel: v, life: 0.5, maxLife: 0.5 });
    }
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        this.fx.splice(i, 1);
        continue;
      }
      f.vel.y -= 12 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.material.opacity = f.life / f.maxLife;
      f.mesh.scale.setScalar(0.4 + f.life / f.maxLife);
    }
  }

  updateGrappleCable() {
    if (!this.player.grapple.active) {
      if (this.cable) { this.scene.remove(this.cable); this.cable.geometry.dispose(); this.cable = null; }
      return;
    }
    const from = new THREE.Vector3(this.player.pos.x, this.player.pos.y + this.player.eye, this.player.pos.z);
    const to = this.player.grapple.anchor.pos;
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    if (!this.cable) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95 });
      this.cable = new THREE.Line(geo, mat);
      this.scene.add(this.cable);
    } else {
      this.cable.geometry.dispose();
      this.cable.geometry = geo;
    }
  }

  /* ------------------------------------------------------------------ */
  update(dt) {
    this.player.update(dt);

    if (this.timerStarted) this.stageTime += dt;

    // Aim anchor
    this.player.aimAnchor = this.player.findAimAnchor();

    // Checkpoint proximity
    for (let i = this.lastCheckpoint + 1; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      const d = cp.pos.distanceTo(this.player.pos);
      if (d < 3.2) {
        this.lastCheckpoint = i;
        cp.reached = true;
        cp.ring.material.color.setHex(0x4dff9e);
        SFX.checkpoint();
        this.ui.showToast('CHECKPOINT', 1000);
        this.checkpointSplits.push({
          label: `CHECKPOINT ${i}`,
          time: this.stageTime + this.penaltyTime
        });
      }
    }

    // Finish trigger
    for (const c of this.colliders) {
      if (c.type !== 'finish') continue;
      const p = this.player;
      if (p.pos.x > c.min.x && p.pos.x < c.max.x &&
          p.pos.y + p.height > c.min.y && p.pos.y < c.max.y &&
          p.pos.z > c.min.z && p.pos.z < c.max.z) {
        this.onFinishReached();
        return;
      }
    }

    // Hazard contact
    for (const c of this.colliders) {
      if (!c.hazard) continue;
      const p = this.player;
      if (p.pos.x + p.radius > c.min.x && p.pos.x - p.radius < c.max.x &&
          p.pos.y + p.height > c.min.y && p.pos.y < c.max.y &&
          p.pos.z + p.radius > c.min.z && p.pos.z - p.radius < c.max.z) {
        p.damage(65);
        if (p.health > 0) this.respawn(true);
        return;
      }
    }

    // Fall off course
    if (this.player.pos.y < this.course.killY) {
      SFX.death();
      this.respawn(true);
      return;
    }

    // Anchor visuals
    for (const a of this.anchors) {
      a.mesh.rotation.y += dt * 1.6;
      const s = 1 + Math.sin(performance.now() * 0.003 + a.pos.x) * 0.06;
      a.halo.scale.setScalar(s);
    }

    // Sun follows the player for crisp shadows
    this.engine.sun.position.set(this.player.pos.x + 28, this.player.pos.y + 55, this.player.pos.z + 18);
    this.engine.sun.target.position.copy(this.player.pos);
    this.engine.sun.target.updateMatrixWorld();

    this.updateGrappleCable();
    this.updateFx(dt);
    this.ui.updateHud(this.player, this.run);
  }

  /* ------------------------------------------------------------------ */
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.dt = dt;

    if (this.state === 'playing') {
      this.update(dt);
    } else {
      this.updateFx(dt);
      this.ui.tickToast(dt);
    }

    this.engine.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
