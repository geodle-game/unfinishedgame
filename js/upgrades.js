// js/upgrades.js
// Data-driven roguelite upgrade pool.
// apply(p) mutates the player's run stats / loadout.

export const UPGRADES = [
  {
    id: 'airControl', name: 'Vector Fins', rarity: 'common',
    desc: '+40% air steering acceleration. Hug corners at speed without losing the line.',
    apply(p) { p.stats.airAccel *= 1.4; }
  },
  {
    id: 'extraJump', name: 'Second Wind', rarity: 'rare',
    desc: 'Grants one additional airborne jump. Does not reset momentum.',
    apply(p) { p.stats.maxAirJumps += 1; }
  },
  {
    id: 'grappleRange', name: 'Extended Tether', rarity: 'common',
    desc: '+10m grapple range and a stronger pull.',
    apply(p) { p.stats.grappleRange += 10; p.stats.grapplePull += 5; }
  },
  {
    id: 'swingEfficiency', name: 'Swing Efficiency', rarity: 'rare',
    desc: 'Grapple rope damps less energy — swings keep far more speed.',
    apply(p) { p.stats.swingDamping *= 0.5; p.stats.grappleReel += 3; }
  },
  {
    id: 'dashRecharge', name: 'Capacitor Bank', rarity: 'common',
    desc: 'Air Dash cooldown reduced by 45%.',
    apply(p) { p.stats.dashCooldown *= 0.55; }
  },
  {
    id: 'dashPower', name: 'Impulse Core', rarity: 'rare',
    desc: 'Air Dash pushes 35% harder.',
    apply(p) { p.stats.dashPower *= 1.35; }
  },
  {
    id: 'slideEff', name: 'Frictionless Plating', rarity: 'common',
    desc: 'Slides lose far less speed and boost harder on entry.',
    apply(p) { p.stats.slideFriction *= 0.5; p.stats.slideBoost += 3; }
  },
  {
    id: 'wallRunExt', name: 'Grip Anchors', rarity: 'common',
    desc: '+0.9s wall-run duration and lower gravity while wall-running.',
    apply(p) { p.stats.wallRunTime += 0.9; p.stats.wallRunGravity *= 0.7; }
  },
  {
    id: 'landing', name: 'Kinetic Landing', rarity: 'common',
    desc: 'Landings preserve nearly all horizontal speed and grant a small boost.',
    apply(p) { p.stats.landRetain = Math.min(1, p.stats.landRetain + 0.22); }
  },
  {
    id: 'healCharge', name: 'Repair Cell', rarity: 'common',
    desc: '+1 Heal Jump charge and +20 max health.',
    apply(p) { p.stats.maxHeals += 1; p.stats.maxHealth += 20; }
  },
  {
    id: 'slamUnlock', name: 'Seismic Module', rarity: 'rare',
    desc: 'Unlocks GROUND SLAM on ability slot R. Landing from a slam rebounds you upward.',
    apply(p) { p.stats.rebound = true; p.grantAbility('slam'); }
  },
  {
    id: 'blinkUnlock', name: 'Phase Lens', rarity: 'epic',
    desc: 'Unlocks BLINK on ability slot R. Short-range teleport to a clear space.',
    apply(p) { p.grantAbility('blink'); }
  },
  {
    id: 'jumpPower', name: 'Hydraulic Legs', rarity: 'common',
    desc: '+12% jump impulse.',
    apply(p) { p.stats.jumpVel *= 1.12; }
  },
  {
    id: 'sprintSpeed', name: 'Overdrive', rarity: 'rare',
    desc: '+15% sprint speed and faster ground acceleration.',
    apply(p) { p.stats.sprintSpeed *= 1.15; p.stats.groundAccel *= 1.2; }
  },
  {
    id: 'slamRebound', name: 'Rebound Springs', rarity: 'epic',
    desc: 'Ground Slam landings launch you high into the air. Opens vertical routes.',
    apply(p) { p.stats.rebound = true; p.stats.reboundPower = 13; p.grantAbility('slam'); }
  }
];

export function rollUpgrades(count = 3, taken = []) {
  const pool = UPGRADES.filter(u => !taken.includes(u.id));
  const weights = pool.map(u => (u.rarity === 'common' ? 5 : u.rarity === 'rare' ? 3 : 1.4));
  const out = [];
  const available = pool.slice();
  const w = weights.slice();
  while (out.length < count && available.length) {
    let total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < w.length; idx++) { r -= w[idx]; if (r <= 0) break; }
    idx = Math.min(idx, available.length - 1);
    out.push(available[idx]);
    available.splice(idx, 1);
    w.splice(idx, 1);
  }
  return out;
}
