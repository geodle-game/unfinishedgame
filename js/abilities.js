// js/abilities.js
import * as THREE from 'three';
import { SFX } from './audio.js';

const _v = new THREE.Vector3();

export const ABILITIES = {
  dash: {
    id: 'dash', name: 'Air Dash', glyph: '≫', keyLabel: 'Q',
    desc: 'Directional burst that ADDS to your current velocity. Works grounded or airborne.',
    unlocked: true,
    ready(p) { return (p.cooldowns.dash || 0) <= 0; },
    use(p) {
      const dir = p.getMoveDir3D();
      if (dir.lengthSq() < 0.01) dir.copy(p.getLookDir());
      p.vel.addScaledVector(dir, p.stats.dashPower);
      const sp = p.vel.length();
      if (sp > p.stats.maxSpeedHard) p.vel.multiplyScalar(p.stats.maxSpeedHard / sp);
      p.airJumps = 0;
      p.wallTimer = 0;
      p.cooldowns.dash = p.stats.dashCooldown;
      p.camShake = Math.max(p.camShake, 0.35);
      SFX.dash();
      p.game.puff(p.pos, 0x35e6ff, 14);
      return true;
    }
  },

  slam: {
    id: 'slam', name: 'Ground Slam', glyph: '▼', keyLabel: 'R',
    desc: 'Accelerate violently downward. Landing triggers a rebound if you have one.',
    unlocked: false,
    ready(p) { return !p.grounded && (p.cooldowns.slam || 0) <= 0; },
    use(p) {
      p.vel.y = -34;
      p.slamming = true;
      p.cooldowns.slam = 1.4;
      SFX.slam();
      return true;
    }
  },

  blink: {
    id: 'blink', name: 'Blink', glyph: '✦', keyLabel: 'R',
    desc: 'Teleport a short distance to a clear location. Never through solid geometry.',
    unlocked: false,
    ready(p) { return (p.cooldowns.blink || 0) <= 0; },
    use(p) {
      const dir = p.getLookDir();
      const eye = _v.copy(p.pos).add(new THREE.Vector3(0, p.eye, 0));
      for (let d = p.stats.blinkRange; d >= 2; d -= 0.75) {
        const tx = eye.x + dir.x * d;
        const ty = eye.y + dir.y * d - p.eye;
        const tz = eye.z + dir.z * d;
        if (!p.collidesAt(tx, ty, tz, p.height)) {
          p.game.puff(p.pos, 0xc07bff, 16);
          p.pos.set(tx, ty, tz);
          p.game.puff(p.pos, 0xc07bff, 16);
          p.cooldowns.blink = 3.2;
          SFX.blink();
          return true;
        }
      }
      return false;
    }
  }
};

export function abilityCooldownRemaining(p, id) {
  return Math.max(0, p.cooldowns[id] || 0);
}
