// js/engine.js
import * as THREE from 'three';

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  scene.fog = new THREE.FogExp2(0x04060c, 0.0068);

  const camera = new THREE.PerspectiveCamera(92, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0x7fa8ff, 0x080a12, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(28, 55, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 42;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x3fd8ff, 0.75);
  rim.position.set(-40, 24, -50);
  scene.add(rim);

  const rim2 = new THREE.DirectionalLight(0xff7a3d, 0.35);
  rim2.position.set(30, 10, 60);
  scene.add(rim2);

  // Deep-space backdrop grid for depth cues
  const grid = new THREE.GridHelper(1200, 120, 0x0d3b52, 0x081a26);
  grid.position.y = -40;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  // Star field
  const starGeo = new THREE.BufferGeometry();
  const starCount = 900;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 900;
    positions[i * 3 + 1] = Math.random() * 300 - 30;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 900;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x6fa9c9, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.7, fog: false
  }));
  scene.add(stars);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function setQuality(q) {
    if (q === 'low') {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      sun.castShadow = false;
    } else if (q === 'medium') {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.castShadow = true;
    } else {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.castShadow = true;
    }
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  return { renderer, scene, camera, sun, hemi, stars, grid, resize, setQuality };
}
