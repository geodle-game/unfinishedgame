// js/level.js
import * as THREE from 'three';

export const MATS = {
  deck: new THREE.MeshStandardMaterial({ color: 0x212a3d, roughness: 0.78, metalness: 0.35 }),
  deckAlt: new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.85, metalness: 0.25 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.7, metalness: 0.4 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff2200, emissiveIntensity: 1.6, roughness: 0.5 }),
  anchorMat: new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb000, emissiveIntensity: 2.2, roughness: 0.3 }),
  finishMat: new THREE.MeshStandardMaterial({ color: 0x4dff9e, emissive: 0x2bff8a, emissiveIntensity: 2.0, roughness: 0.35 }),
  cpMat: new THREE.MeshStandardMaterial({ color: 0x35e6ff, emissive: 0x22c8ff, emissiveIntensity: 1.8, roughness: 0.4 }),
  edge: new THREE.LineBasicMaterial({ color: 0x35e6ff, transparent: true, opacity: 0.55 }),
  edgeWarm: new THREE.LineBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.7 })
};

const BOX = new THREE.BoxGeometry(1, 1, 1);

function makeBox(x, y, z, w, h, d, mat) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addEdges(group, x, y, z, w, h, d, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat || MATS.edge);
  e.position.set(x, y, z);
  group.add(e);
  return e;
}

/** Platform: top surface sits exactly at topY. */
function addPlatform(ctx, x, topY, z, w, d, opts = {}) {
  const thickness = opts.thickness ?? 1.0;
  const cy = topY - thickness / 2;
  const mesh = makeBox(x, cy, z, w, thickness, d, opts.mat || MATS.deck);
  ctx.group.add(mesh);
  addEdges(ctx.group, x, cy, z, w, thickness, d, opts.edgeMat);

  const col = {
    min: new THREE.Vector3(x - w / 2, topY - thickness, z - d / 2),
    max: new THREE.Vector3(x + w / 2, topY, z + d / 2),
    mesh, type: opts.type || 'solid', trigger: false
  };
  ctx.colliders.push(col);
  ctx.minY = Math.min(ctx.minY, topY - thickness);
  return col;
}

/** Generic box centred on (x,y,z). */
function addBox(ctx, x, y, z, w, h, d, opts = {}) {
  const mesh = makeBox(x, y, z, w, h, d, opts.mat || MATS.wall);
  ctx.group.add(mesh);
  addEdges(ctx.group, x, y, z, w, h, d, opts.edgeMat);
  const col = {
    min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
    mesh, type: opts.type || 'solid', trigger: false, hazard: !!opts.hazard, wallrun: !!opts.wallrun
  };
  ctx.colliders.push(col);
  ctx.minY = Math.min(ctx.minY, y - h / 2);
  return col;
}

function addAnchor(ctx, x, y, z) {
  const g = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.13, 10, 20), MATS.anchorMat);
  torus.rotation.x = Math.PI / 2;
  g.add(torus);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.14 })
  );
  g.add(halo);
  g.position.set(x, y, z);
  ctx.group.add(g);
  ctx.anchors.push({ pos: new THREE.Vector3(x, y, z), mesh: g, halo });
}

function addCheckpoint(ctx, x, y, z, isStart = false) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 28),
    new THREE.MeshBasicMaterial({ color: isStart ? 0x4dff9e : 0x35e6ff, transparent: true, opacity: 0.85 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.45, 4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: isStart ? 0x4dff9e : 0x35e6ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  );
  beam.position.y = 2;
  g.add(beam);
  g.position.set(x, y, z);
  ctx.group.add(g);
  const cp = {
    pos: new THREE.Vector3(x, y, z), mesh: g, ring,
    index: ctx.checkpoints.length, isStart
  };
  ctx.checkpoints.push(cp);
  return cp;
}

function addGate(ctx, x, y, z, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.3 });
  const p1 = makeBox(-3.2, 2.5, 0, 0.5, 5, 0.5, mat);
  const p2 = makeBox(3.2, 2.5, 0, 0.5, 5, 0.5, mat);
  const top = makeBox(0, 5.0, 0, 7, 0.4, 0.5, mat);
  g.add(p1, p2, top);
  g.position.set(x, y, z);
  ctx.group.add(g);
  return g;
}

/* =====================================================================
   MODULE BUILDERS
   All modules travel toward -Z and are axis-aligned (so AABB collision
   stays exact). Each sets ctx.z to its new frontier.
   ===================================================================== */

function buildStart(ctx) {
  addPlatform(ctx, 0, 0, -6, 18, 30);
  addGate(ctx, 0, 0, 0, 0x35e6ff);
  addCheckpoint(ctx, 0, 0, 4, true);
  ctx.z = -21;
  ctx.y = 0;
}

function buildJumps(ctx) {
  let z = ctx.z;
  const count = 4;
  for (let i = 0; i < count; i++) {
    const w = 7.5 - i * 0.9;
    const d = 4.5;
    const x = Math.sin(i * 1.75) * 3.6;
    addPlatform(ctx, x, ctx.y, z - 4, w, d);
    z -= 4 + d + 3.0 + Math.random() * 1.8;
  }
  addPlatform(ctx, 0, ctx.y, z - 6, 11, 12);
  z -= 12;
  addCheckpoint(ctx, 0, ctx.y, z + 6);
  ctx.z = z;
}

function buildStairs(ctx) {
  const steps = 14, rise = 0.45, run = 2.0, w = 9;
  let z = ctx.z;
  for (let i = 0; i < steps; i++) {
    const topY = ctx.y + (i + 1) * rise;
    addPlatform(ctx, 0, topY, z - run / 2, w, run, { thickness: 0.6 });
    z -= run;
  }
  ctx.y += steps * rise;
  addPlatform(ctx, 0, ctx.y, z - 5, 11, 10);
  z -= 10;
  addCheckpoint(ctx, 0, ctx.y, z + 5);
  ctx.z = z;
}

function buildGrappleSpan(ctx) {
  let z = ctx.z;
  // Launch platform
  addPlatform(ctx, 0, ctx.y, z - 4, 11, 8);
  z -= 8;
  // Anchors over the void
  addAnchor(ctx, 0, ctx.y + 9.5, z - 9);
  addAnchor(ctx, 5, ctx.y + 12, z - 22);
  // Risky mid island
  addPlatform(ctx, -5, ctx.y - 0.5, z - 18, 4, 4);
  // Landing
  const landZ = z - 36;
  addPlatform(ctx, 1, ctx.y, landZ - 6, 13, 12);
  addCheckpoint(ctx, 1, ctx.y, landZ - 2);
  ctx.z = landZ - 12;
}

function buildWallRun(ctx) {
  let z = ctx.z;
  addPlatform(ctx, 0, ctx.y, z - 3, 11, 6);
  z -= 6;
  const len = 26;
  // Walls
  addBox(ctx, -4.7, ctx.y + 3, z - len / 2, 0.9, 7, len, { wallrun: true, mat: MATS.wall });
  addBox(ctx, 4.7, ctx.y + 3, z - len / 2, 0.9, 7, len, { wallrun: true, mat: MATS.wall });
  // Hazard floor far below
  const haz = addBox(ctx, 0, ctx.y - 6, z - len / 2, 9, 0.6, len, { hazard: true, mat: MATS.hazard, type: 'hazard' });
  haz.trigger = false;
  z -= len;
  addPlatform(ctx, 0, ctx.y, z - 5, 12, 10);
  addCheckpoint(ctx, 0, ctx.y, z - 1);
  ctx.z = z - 10;
}

function buildTunnel(ctx) {
  let z = ctx.z;
  addPlatform(ctx, 0, ctx.y, z - 12, 10, 26);
  // Low ceiling — forces a slide
  addBox(ctx, 0, ctx.y + 1.65, z - 7, 10, 1.0, 10, { mat: MATS.wall });
  // Decorative pillars
  addBox(ctx, -5.2, ctx.y + 2.5, z - 18, 0.7, 5, 0.7, { mat: MATS.wall });
  addBox(ctx, 5.2, ctx.y + 2.5, z - 18, 0.7, 5, 0.7, { mat: MATS.wall });
  z -= 26;
  addPlatform(ctx, 0, ctx.y, z - 5, 11, 9);
  addCheckpoint(ctx, 0, ctx.y, z - 1);
  ctx.z = z - 9;
}

function buildBeams(ctx) {
  let z = ctx.z;
  addPlatform(ctx, 0, ctx.y, z - 3, 10, 6);
  z -= 6;
  for (let i = 0; i < 3; i++) {
    const x = (i % 2 === 0) ? -1.2 : 1.2;
    addPlatform(ctx, x, ctx.y, z - 8, 1.5, 15, { thickness: 0.7, mat: MATS.deckAlt });
    z -= 17;
  }
  addPlatform(ctx, 0, ctx.y, z - 5, 12, 10);
  addCheckpoint(ctx, 0, ctx.y, z - 1);
  ctx.z = z - 10;
}

function buildFinish(ctx) {
  const z = ctx.z;
  addPlatform(ctx, 0, ctx.y, z - 9, 20, 22, { mat: MATS.deckAlt });
  addGate(ctx, 0, ctx.y, z - 12, 0x4dff9e);
  const trigger = {
    min: new THREE.Vector3(-10, ctx.y, z - 20),
    max: new THREE.Vector3(10, ctx.y + 6, z - 4),
    trigger: true, type: 'finish', mesh: null
  };
  ctx.colliders.push(trigger);
  ctx.finish = new THREE.Vector3(0, ctx.y, z - 12);
  ctx.z = z - 20;
}

const MODULES = [
  { id: 'jumps', build: buildJumps },
  { id: 'stairs', build: buildStairs },
  { id: 'grapple', build: buildGrappleSpan },
  { id: 'wallrun', build: buildWallRun },
  { id: 'tunnel', build: buildTunnel },
  { id: 'beams', build: buildBeams }
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildCourse(stageIndex = 0) {
  const group = new THREE.Group();
  const ctx = {
    group,
    colliders: [],
    anchors: [],
    checkpoints: [],
    z: 0,
    y: 0,
    minY: 0,
    finish: new THREE.Vector3(0, 0, 0)
  };

  buildStart(ctx);

  const pool = shuffle(MODULES.slice());
  const count = 3 + Math.min(stageIndex, 2);
  for (let i = 0; i < count; i++) {
    const m = pool[i % pool.length];
    ctx.z -= 2;
    m.build(ctx);
  }

  buildFinish(ctx);

  const length = Math.abs(ctx.z);
  const parTime = 22 + length / 9 + stageIndex * 8;

  return {
    group,
    colliders: ctx.colliders,
    anchors: ctx.anchors,
    checkpoints: ctx.checkpoints,
    start: { pos: new THREE.Vector3(0, 0.05, 8), yaw: 0 },
    finishPos: ctx.finish,
    killY: ctx.minY - 30,
    length,
    parTime
  };
}
