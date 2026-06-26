/**
 * LUMIÈRE — main.js v5
 * ─────────────────────────────────────────────────────────────────
 * NEW:
 *   • 3 Animated helix light trails (glowing comet streaks spiraling
 *     around the god-ray beam) — each with a bright orb head & fading tail
 *   • Spherical particles everywhere (canvas radial-gradient circle texture
 *     on PointsMaterial + gl_PointCoord discard on helix ShaderMaterial)
 *   • Extra large "bokeh" orb layer inside the beam (like the ref image)
 * KEPT:
 *   • Scroll: phase-1 zoom-out (0–38 %) + phase-2 270° orbit + lamp rise
 *   • 4300 fine beam-cone particles + 200 bokeh orbs + 1400 ambient
 *   • 2-D streak canvas, bloom, warm env map, bulb flicker
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ── DOM ──────────────────────────────────────────────────────────
const canvas = document.getElementById('three-canvas');
const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderTxt = document.getElementById('loader-text');
const lightConeEl = document.getElementById('light-cone');
const streakCanvas = document.getElementById('streak-canvas');
const overlayEl = document.getElementById('overlay');
const welcomeTextEl = document.getElementById('welcome-text');
const fogLayerEl = document.getElementById('fog-layer');
const nextSectionEl = document.getElementById('next-section');
const scrollDashes = document.querySelectorAll('.scroll-dash');
const sctx = streakCanvas.getContext('2d');

// Click-to-scroll on each dash
scrollDashes.forEach((dash, idx) => {
  dash.addEventListener('click', () => {
    const total = scrollDashes.length;
    if (total <= 1) return;
    const fraction = idx / (total - 1);
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: fraction * maxScroll, behavior: 'smooth' });
  });
});

// ── Renderer ─────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// ── Scene ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.016);

// ── Camera ────────────────────────────────────────────────────────
const CAM_NEAR_R = 7;
const CAM_FAR_R = 13;
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 300);
camera.position.set(0, -2.5, CAM_NEAR_R);
const lookAt = new THREE.Vector3(0, 1.5, 0);
camera.lookAt(lookAt);

// ── Post-processing ───────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.80, 0.50, 0.70
);
composer.addPass(bloomPass);

// ── Easing ────────────────────────────────────────────────────────
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 2.4);
const smoothstep = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// ── Scroll ────────────────────────────────────────────────────────
let scrollProgress = 0;
window.addEventListener('scroll', () => {
  const maxS = document.body.scrollHeight - window.innerHeight;
  scrollProgress = maxS > 0 ? Math.min(window.scrollY / maxS, 1) : 0;
}, { passive: true });

// ── Lighting ─────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x1a1008, 0.8));

const bulbLight = new THREE.PointLight(0xffd080, 95, 26, 2);
bulbLight.position.set(0, 1.4, 0);
bulbLight.castShadow = true;
bulbLight.shadow.mapSize.set(1024, 1024);
scene.add(bulbLight);

const bulbMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.065, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xfff5c0, emissive: 0xfff080, emissiveIntensity: 6 })
);
bulbMesh.position.copy(bulbLight.position);
scene.add(bulbMesh);

const spotDown = new THREE.SpotLight(0xffc060, 70, 26, Math.PI * 0.18, 0.35, 2);
spotDown.position.set(0, 1.6, 0);
spotDown.target.position.set(0, -8, 0);
spotDown.castShadow = true;
scene.add(spotDown, spotDown.target);

const rimLight = new THREE.DirectionalLight(0x3050a0, 0.35);
rimLight.position.set(-4, 3, -5);
scene.add(rimLight);
const topFill = new THREE.DirectionalLight(0xffeedd, 0.12);
topFill.position.set(0, 10, 2);
scene.add(topFill);

// ──────────────────────────────────────────────────────────────────
//  SPHERICAL PARTICLE TEXTURE
//  Canvas-drawn radial gradient → soft glowing orb (no square corners)
// ──────────────────────────────────────────────────────────────────
function createCircleTexture(sz = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const ctx = cv.getContext('2d');
  const c = sz / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  g.addColorStop(0.20, 'rgba(255,255,255,0.90)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.30)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  return new THREE.CanvasTexture(cv);
}
const circleTex = createCircleTexture();

// ──────────────────────────────────────────────────────────────────
//  HELIX TRAIL — Continuous Line
// ──────────────────────────────────────────────────────────────────

// ── Beam group (all beam children follow the lamp on scroll) ──────
const CONE_H = 32;
const CONE_R = 1.8;
const beamGroup = new THREE.Group();
scene.add(beamGroup);

// ──────────────────────────────────────────────────────────────────
//  LIQUID DISTORTION BARRIER PLANE
// ──────────────────────────────────────────────────────────────────
const distortionVS = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDistortT;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5;
    }
    return v;
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Slower, smoother boiling animation
    float n = fbm(uv * 2.5 + vec2(uTime * 0.03, uTime * 0.015));
    
    // Geometry is permanently displaced (no uDistortT here), we fade it in via opacity instead
    pos.z += n * 12.0;
    // Lateral rippling
    pos.x += fbm(uv * 3.5 + uTime * 0.01) * 3.0;
    pos.y += fbm(uv * 3.5 - uTime * 0.01) * 3.0;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const distortionFS = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDistortT;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }

  void main() {
    // Slower noise for colors
    float n = fbm(vUv * 3.0 + uTime * 0.015);
    float n2 = fbm(vUv * 7.0 + uTime * 0.01 + vec2(3.14));
    
    float edge = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y)
               * smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
               
    // Fade in purely through opacity
    float alpha = uDistortT * n * 0.65 * edge;
    
    // Reverted to golden-yellow warm colors
    vec3 cold = vec3(1.00, 0.85, 0.40);
    vec3 hot  = vec3(1.00, 1.00, 0.92);
    vec3 col  = mix(cold, hot, n2);
    gl_FragColor = vec4(col, alpha);
  }
`;

const distortMat = new THREE.ShaderMaterial({
  vertexShader: distortionVS,
  fragmentShader: distortionFS,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uDistortT: { value: 0 },
  }
});

const distortPlane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 100, 100), distortMat);
distortPlane.rotation.x = -Math.PI / 2; // Lay it flat
distortPlane.visible = false;
scene.add(distortPlane);

// ──────────────────────────────────────────────────────────────────
//  GOLDEN FOG DISC (3D LAYER)
// ──────────────────────────────────────────────────────────────────
function createFogDiscTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const c = 256;
  const g1 = ctx.createRadialGradient(c, c, 0, c, c, 256);
  g1.addColorStop(0.00, 'rgba(20, 50, 120, 0.90)');
  g1.addColorStop(0.20, 'rgba(15, 35, 90,  0.75)');
  g1.addColorStop(0.50, 'rgba(10, 20, 60,  0.40)');
  g1.addColorStop(0.75, 'rgba(5,  10, 30,  0.15)');
  g1.addColorStop(1.00, 'rgba(0,   0,   0,   0.00)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 512, 512);
  const g2 = ctx.createRadialGradient(c, c, 0, c, c, 80);
  g2.addColorStop(0.00, 'rgba(255, 255, 255, 0.55)');
  g2.addColorStop(1.00, 'rgba(255, 255, 255, 0.00)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(cv);
}

const fogDiscMat = new THREE.MeshBasicMaterial({
  map: createFogDiscTexture(),
  transparent: true,
  opacity: 0.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const fogDisc = new THREE.Mesh(new THREE.PlaneGeometry(32, 32, 1, 1), fogDiscMat);
fogDisc.rotation.x = -Math.PI / 2;
scene.add(fogDisc);

// ──────────────────────────────────────────────────────────────────
//  HELIX TRAILS — 3 spirals, 120° apart, each with 90-point trail
// ──────────────────────────────────────────────────────────────────
const TRAIL_N = 240;   // denser particle count for clustered strings
const TRAIL_STEP = 0.0035; // tighter base step since we are scattering
const HELIX_TURNS = 4.5;  // full rotations lamp-to-beam-bottom

const helixTrails = [];

function addHelixTrail(phaseOffset, headColor, speed, rScale, rOffset) {
  const posArr = new Float32Array(TRAIL_N * 3);
  const colArr = new Float32Array(TRAIL_N * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.26, // distinct dot, larger for more prominent glow
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: circleTex,
    alphaTest: 0.01,
  });

  const pts = new THREE.Points(geo, mat);
  beamGroup.add(pts);

  helixTrails.push({
    head: Math.random(),  // stagger start positions
    phase: phaseOffset,
    speed,
    rScale,
    rOffset,
    color: headColor,
    geo, mat,
  });
}

// Gold, amber, pale-white — warm tones to match the lamp
// 24 strings spaced around, very slow speed, with randomized internal offsets
const palette = [
  [1.0, 0.88, 0.35],
  [1.0, 0.62, 0.18],
  [0.95, 1.0, 0.75],
  [1.0, 0.80, 0.40],
  [1.0, 0.70, 0.25],
];

for (let i = 0; i < 24; i++) {
  const phase = (Math.PI * 2 / 24) * i;
  const color = palette[Math.floor(Math.random() * palette.length)];
  const speed = 0.01 + Math.random() * 0.015; // Very slow speed
  const rScale = 1.1 + Math.random() * 0.4;   // 1.1 to 1.5
  const rOffset = 0.15 + Math.random() * 0.4; // Randomize start offset inside the lamp bounds
  addHelixTrail(phase, color, speed, rScale, rOffset);
}

/** Compute helix position at normalised progress t (0–1, wrapping) */
function helixPos(t, phase, rScale, rOffset) {
  const tw = ((t % 1) + 1) % 1;
  const angle = tw * Math.PI * 2 * HELIX_TURNS + phase;
  const depth = tw * CONE_H;
  const r = (tw * CONE_R * 0.95 + rOffset) * rScale;
  return [Math.cos(angle) * r, -(depth + 1.85), Math.sin(angle) * r];
}

/** Update one helix trail for this frame */
function updateHelixTrail(trail, dt, distortT = 0) {
  trail.head = (trail.head + dt * trail.speed) % 1.0;
  const { head, phase, rScale, rOffset, color, geo } = trail;

  const pArr = geo.attributes.position.array;
  const cArr = geo.attributes.color.array;

  for (let i = 0; i < TRAIL_N; i++) {
    const [px, py, pz] = helixPos(head - i * TRAIL_STEP, phase, rScale, rOffset);

    // Pseudo-random scatter to pour particles inside and around the string
    const scatter = 0.35; // How far particles scatter from the mathematical center line
    const sx = Math.sin(i * 12.9898 + phase * 10) * scatter;
    const sy = Math.sin(i * 78.233 + phase * 10) * scatter;
    const sz = Math.cos(i * 37.719 + phase * 10) * scatter;

    pArr[i * 3] = px + sx;
    pArr[i * 3 + 1] = py + sy;
    pArr[i * 3 + 2] = pz + sz;

    // Smooth brightness falloff head → tail, intensified to trigger strong bloom
    const frac = Math.pow(Math.max(0, 1 - i / TRAIL_N), 1.4);
    let intensity = frac * 7.5; // higher multiplier to make it glow even more brightly

    // Filter points that pass below the barrier (y < -32.5)
    if (py < -32.5) {
      // Only 1 in 15 particles survives the barrier, and they are dimmer
      const survive = (i % 15 === 0) ? 0.35 : 0.0;
      intensity = intensity * (1.0 - distortT) + (intensity * survive) * distortT;
    }

    cArr[i * 3] = color[0] * intensity;
    cArr[i * 3 + 1] = color[1] * intensity;
    cArr[i * 3 + 2] = color[2] * intensity;
  }

  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
}

// ──────────────────────────────────────────────────────────────────
//  GOD-RAY BEAM PARTICLES — cone volume (fine motes + bokeh layer)
// ──────────────────────────────────────────────────────────────────
// Layer A — 4300 fine dust motes (small, dense)
const BP_A = 4300;
const bpAPos = new Float32Array(BP_A * 3);
const bpACol = new Float32Array(BP_A * 3);
const bpAVel = new Array(BP_A);

function spawnFine(i) {
  const h = Math.pow(Math.random(), 0.55);
  const maxR = h * CONE_R;
  const r = maxR * Math.pow(Math.random(), 2.0);
  const a = Math.random() * Math.PI * 2;
  bpAPos[i * 3] = Math.cos(a) * r;
  bpAPos[i * 3 + 1] = -h * CONE_H;
  bpAPos[i * 3 + 2] = Math.sin(a) * r;
  const rf = maxR > 0.001 ? r / maxR : 0;
  const br = (1 - rf * 0.68) * (0.35 + Math.random() * 0.65);
  const rnd = Math.random();
  if (rnd > 0.80) { bpACol[i * 3] = br; bpACol[i * 3 + 1] = br * 0.94; bpACol[i * 3 + 2] = br * 0.60; }
  else if (rnd > 0.48) { bpACol[i * 3] = br; bpACol[i * 3 + 1] = br * 0.72; bpACol[i * 3 + 2] = br * 0.18; }
  else { bpACol[i * 3] = br * 0.88; bpACol[i * 3 + 1] = br * 0.50; bpACol[i * 3 + 2] = br * 0.07; }
  bpAVel[i] = { x: (Math.random() - 0.5) * 0.0045, y: (Math.random() - 0.5) * 0.0030 - 0.0007, z: (Math.random() - 0.5) * 0.0045 };
}
for (let i = 0; i < BP_A; i++) spawnFine(i);

const bpAGeo = new THREE.BufferGeometry();
bpAGeo.setAttribute('position', new THREE.BufferAttribute(bpAPos, 3));
bpAGeo.setAttribute('color', new THREE.BufferAttribute(bpACol, 3));
const bpAMat = new THREE.PointsMaterial({
  size: 0.065, sizeAttenuation: true, transparent: true, opacity: 0.80,
  blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
  map: circleTex, alphaTest: 0.01,
});
beamGroup.add(new THREE.Points(bpAGeo, bpAMat));

// Layer B — 200 large bokeh orbs (soft, blurred glowing circles)
const BP_B = 200;
const bpBPos = new Float32Array(BP_B * 3);
const bpBCol = new Float32Array(BP_B * 3);
const bpBVel = new Array(BP_B);

function spawnBokeh(i) {
  const h = Math.pow(Math.random(), 0.45);
  const r = h * CONE_R * (0.1 + Math.random() * 0.55);
  const a = Math.random() * Math.PI * 2;
  bpBPos[i * 3] = Math.cos(a) * r;
  bpBPos[i * 3 + 1] = -h * CONE_H;
  bpBPos[i * 3 + 2] = Math.sin(a) * r;
  const br = 0.4 + Math.random() * 0.6;
  const rnd = Math.random();
  if (rnd > 0.6) { bpBCol[i * 3] = br; bpBCol[i * 3 + 1] = br * 0.85; bpBCol[i * 3 + 2] = br * 0.35; }
  else { bpBCol[i * 3] = br; bpBCol[i * 3 + 1] = br * 0.60; bpBCol[i * 3 + 2] = br * 0.15; }
  bpBVel[i] = { x: (Math.random() - 0.5) * 0.002, y: (Math.random() - 0.5) * 0.0015 - 0.0004, z: (Math.random() - 0.5) * 0.002 };
}
for (let i = 0; i < BP_B; i++) spawnBokeh(i);

const bpBGeo = new THREE.BufferGeometry();
bpBGeo.setAttribute('position', new THREE.BufferAttribute(bpBPos, 3));
bpBGeo.setAttribute('color', new THREE.BufferAttribute(bpBCol, 3));
const bpBMat = new THREE.PointsMaterial({
  size: 0.28, sizeAttenuation: true, transparent: true, opacity: 0.55,
  blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
  map: circleTex, alphaTest: 0.01,
});
beamGroup.add(new THREE.Points(bpBGeo, bpBMat));

// ──────────────────────────────────────────────────────────────────
//  RGB PARTICLES (Slow pouring below the cloud)
// ──────────────────────────────────────────────────────────────────
const RGB_COUNT = 3000;
const rgbPos = new Float32Array(RGB_COUNT * 3);
const rgbCol = new Float32Array(RGB_COUNT * 3);
const rgbVel = [];
for (let i = 0; i < RGB_COUNT; i++) {
  const r = Math.random() * CONE_R * 4.0; // even wider spread
  const a = Math.random() * Math.PI * 2;
  // Spawn between -28.0 (cloud surface peak) and -53.0
  rgbPos[i * 3] = Math.cos(a) * r;
  rgbPos[i * 3 + 1] = -28.0 - Math.random() * 25.0;
  rgbPos[i * 3 + 2] = Math.sin(a) * r;

  // Very slow downward velocity
  rgbVel.push({
    x: (Math.random() - 0.5) * 0.002,
    y: -0.0005 - Math.random() * 0.002, // slow falling
    z: (Math.random() - 0.5) * 0.002
  });

  // Vibrant RGB colors
  const hue = Math.random();
  const c = new THREE.Color().setHSL(hue, 1.0, 0.6);
  rgbCol[i * 3] = c.r; rgbCol[i * 3 + 1] = c.g; rgbCol[i * 3 + 2] = c.b;
}

const rgbGeo = new THREE.BufferGeometry();
rgbGeo.setAttribute('position', new THREE.BufferAttribute(rgbPos, 3));
rgbGeo.setAttribute('color', new THREE.BufferAttribute(rgbCol, 3));
const rgbMat = new THREE.PointsMaterial({
  size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.0, // Faded in later
  blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
  map: circleTex, alphaTest: 0.01,
});
beamGroup.add(new THREE.Points(rgbGeo, rgbMat));

// ──────────────────────────────────────────────────────────────────
//  AMBIENT PARTICLES (drifting dust around the scene)
// ──────────────────────────────────────────────────────────────────
const AP = 1400;
const apPos = new Float32Array(AP * 3);
const apCol = new Float32Array(AP * 3);
const apBaseCol = new Float32Array(AP * 3);
const apVel = [];

for (let i = 0; i < AP; i++) {
  const r = Math.random() * 9, a = Math.random() * Math.PI * 2;
  apPos[i * 3] = Math.cos(a) * r; apPos[i * 3 + 1] = (Math.random() - 0.5) * 18; apPos[i * 3 + 2] = Math.sin(a) * r - 1;
  apVel.push({ x: (Math.random() - 0.5) * 0.002, y: 0.003 + Math.random() * 0.006, z: (Math.random() - 0.5) * 0.002 });
  const w = Math.random();
  if (w > 0.85) { apBaseCol[i * 3] = 1.0; apBaseCol[i * 3 + 1] = 0.98; apBaseCol[i * 3 + 2] = 0.92; }
  else if (w > 0.6) { apBaseCol[i * 3] = 1.0; apBaseCol[i * 3 + 1] = 0.80; apBaseCol[i * 3 + 2] = 0.30; }
  else { apBaseCol[i * 3] = 0.8; apBaseCol[i * 3 + 1] = 0.55; apBaseCol[i * 3 + 2] = 0.10; }
  apCol[i * 3] = apBaseCol[i * 3];
  apCol[i * 3 + 1] = apBaseCol[i * 3 + 1];
  apCol[i * 3 + 2] = apBaseCol[i * 3 + 2];
}
const apGeo = new THREE.BufferGeometry();
apGeo.setAttribute('position', new THREE.BufferAttribute(apPos, 3));
apGeo.setAttribute('color', new THREE.BufferAttribute(apCol, 3));

const apMat = new THREE.PointsMaterial({
  size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.60,
  blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true,
  map: circleTex, alphaTest: 0.01,
});
scene.add(new THREE.Points(apGeo, apMat));

// Stars
const sPos = new Float32Array(600 * 3);
for (let i = 0; i < 600; i++) { sPos[i * 3] = (Math.random() - 0.5) * 50; sPos[i * 3 + 1] = (Math.random() - 0.5) * 24; sPos[i * 3 + 2] = -(Math.random() * 25 + 5); }
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  size: 0.04, sizeAttenuation: true, transparent: true, opacity: 0.22,
  blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff,
  map: circleTex, alphaTest: 0.01,
}));
scene.add(stars);

// ──────────────────────────────────────────────────────────────────
//  2-D STREAK CANVAS (lens-flare from lamp projected to screen)
// ──────────────────────────────────────────────────────────────────
function resizeStreak() { streakCanvas.width = window.innerWidth; streakCanvas.height = window.innerHeight; }
resizeStreak();

const STREAK_DEFS = Array.from({ length: 18 }, (_, i) => ({
  baseAngle: (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
  length: (i % 3 === 0 ? 0.20 : 0.09) + Math.random() * 0.12,
  maxOpacity: i % 3 === 0 ? 0.38 + Math.random() * 0.18 : 0.14 + Math.random() * 0.14,
  width: i % 3 === 0 ? 1.0 + Math.random() * 0.8 : 0.4 + Math.random() * 0.6,
  rotSpeed: (Math.random() - 0.5) * 0.00020,
  phase: Math.random() * Math.PI * 2,
  pulseFreq: 0.5 + Math.random() * 2.0,
}));

const _wp = new THREE.Vector3();
function worldToScreen(p) { const v = p.clone().project(camera); return { x: (v.x + 1) * 0.5 * window.innerWidth, y: (-v.y + 1) * 0.5 * window.innerHeight }; }

function drawStreaks(t, cx, cy, flicker, fade) {
  sctx.clearRect(0, 0, streakCanvas.width, streakCanvas.height);
  if (fade <= 0.01) return;
  const md = Math.min(streakCanvas.width, streakCanvas.height);
  sctx.save(); sctx.globalCompositeOperation = 'lighter';
  for (const s of STREAK_DEFS) {
    const angle = s.baseAngle + t * s.rotSpeed;
    const pulse = 0.5 + 0.5 * Math.sin(t * s.pulseFreq + s.phase);
    const op = s.maxOpacity * pulse * flicker * fade;
    const len = s.length * md * (0.75 + 0.25 * pulse);
    const x2 = cx + Math.cos(angle) * len, y2 = cy + Math.sin(angle) * len;
    const g = sctx.createLinearGradient(cx, cy, x2, y2);
    g.addColorStop(0, 'rgba(255,240,155,' + op + ')');
    g.addColorStop(0.25, 'rgba(255,195,75,' + (op * 0.60) + ')');
    g.addColorStop(0.70, 'rgba(255,135,25,' + (op * 0.22) + ')');
    g.addColorStop(1, 'rgba(255,90,0,0)');
    sctx.beginPath(); sctx.moveTo(cx, cy); sctx.lineTo(x2, y2);
    sctx.strokeStyle = g; sctx.lineWidth = s.width; sctx.lineCap = 'round'; sctx.stroke();
  }
  const hr = 48 * flicker * fade;
  const hg = sctx.createRadialGradient(cx, cy, 0, cx, cy, hr);
  hg.addColorStop(0, 'rgba(255,248,205,' + (0.50 * fade * flicker) + ')');
  hg.addColorStop(0.35, 'rgba(255,205,85,' + (0.26 * fade * flicker) + ')');
  hg.addColorStop(1, 'rgba(255,95,0,0)');
  sctx.beginPath(); sctx.arc(cx, cy, hr, 0, Math.PI * 2); sctx.fillStyle = hg; sctx.fill();
  sctx.restore();
}

// ──────────────────────────────────────────────────────────────────
//  LOAD GLB MODEL
// ──────────────────────────────────────────────────────────────────
let lampModel = null, lampInitialY = 0, lampInitialScale = 1;
let initBulbY = 0, initSpotY = 0, initBeamY = 0, modelLoaded = false;

const mgr = new THREE.LoadingManager();
mgr.onProgress = (_, l, tot) => { const p = Math.round(l / tot * 100); loaderBar.style.width = p + '%'; loaderTxt.textContent = `Loading… ${p}%`; };
mgr.onLoad = () => { loaderTxt.textContent = 'Ready'; setTimeout(() => loaderEl.classList.add('hidden'), 500); };

const draco = new DRACOLoader(mgr);
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const gltfLdr = new GLTFLoader(mgr); gltfLdr.setDRACOLoader(draco);

gltfLdr.load('plafonnier/source/Plafonnier couloir RdC.glb',
  (g) => {
    lampModel = g.scene;
    const box = new THREE.Box3().setFromObject(lampModel);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 2.5 / Math.max(size.x, size.y, size.z);
    lampModel.scale.setScalar(scale);
    box.setFromObject(lampModel);
    const scaledSize = box.getSize(new THREE.Vector3()); box.getCenter(center);
    const targetTopY = 3.5;
    lampModel.position.set(-center.x, targetTopY - (center.y + scaledSize.y * 0.5), -center.z);
    lampModel.traverse(c => {
      if (!c.isMesh) return;
      c.castShadow = c.receiveShadow = true;
      if (c.material) { c.material.metalness = Math.min((c.material.metalness || 0) + 0.1, 1); c.material.roughness = Math.max((c.material.roughness || 0.5) - 0.05, 0.05); c.material.envMapIntensity = 1.4; c.material.needsUpdate = true; }
    });
    scene.add(lampModel);
    const lb = targetTopY - scaledSize.y * 0.5;
    bulbLight.position.set(0, lb - 0.1, 0); bulbMesh.position.copy(bulbLight.position);
    spotDown.position.set(0, lb + 0.05, 0); beamGroup.position.set(0, lb - 0.08, 0);
    lampInitialY = lampModel.position.y; lampInitialScale = scale;
    initBulbY = bulbLight.position.y; initSpotY = spotDown.position.y; initBeamY = beamGroup.position.y;
    modelLoaded = true;
  },
  (xhr) => { if (xhr.total > 0) loaderBar.style.width = Math.round(xhr.loaded / xhr.total * 100) + '%'; },
  (err) => { console.error(err); loaderTxt.textContent = 'Error'; }
);

// ── Env Map ───────────────────────────────────────────────────────
(async () => {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    const sz = 256, d = new Uint8ClampedArray(sz * sz * 4);
    for (let y = 0; y < sz; y++)for (let x = 0; x < sz; x++) { const t = y / sz, idx = (y * sz + x) * 4; if (t < 0.5) { d[idx] = Math.round(3 + t * 8); d[idx + 1] = Math.round(3 + t * 5); d[idx + 2] = Math.round(8 + t * 10); } else { const b = (t - 0.5) * 2; d[idx] = Math.round(10 + b * 20); d[idx + 1] = Math.round(6 + b * 10); d[idx + 2] = Math.round(2 + b * 4); } d[idx + 3] = 255; }
    const et = new THREE.DataTexture(d, sz, sz, THREE.RGBAFormat);
    et.colorSpace = THREE.SRGBColorSpace; et.mapping = THREE.EquirectangularReflectionMapping; et.needsUpdate = true;
    scene.environment = pmrem.fromEquirectangular(et).texture; scene.background = new THREE.Color(0x000000);
    pmrem.dispose(); et.dispose();
  } catch (e) { console.warn('env', e); }
})();

// ── Resize ────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
  resizeStreak();
});

// ── Swipe Rotation ────────────────────────────────────────────────
let dragStartX = 0;
let isDragging = false;
let userOrbitTarget = 0;
let userOrbit = 0;

window.addEventListener('pointerdown', (e) => {
  isDragging = true;
  dragStartX = e.clientX;
});
window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  dragStartX = e.clientX;
  userOrbitTarget -= dx * 0.005; // Drag sensitivity
});
window.addEventListener('pointerup', () => { isDragging = false; });
window.addEventListener('pointercancel', () => { isDragging = false; });

// ──────────────────────────────────────────────────────────────────
//  ANIMATION LOOP
// ──────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let prevT = 0;

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(t - prevT, 0.05); // cap delta to avoid jump on tab refocus
  prevT = t;

  // Flicker
  const flicker = 1 + Math.sin(t * 13.7) * 0.04 + Math.sin(t * 31.3) * 0.02;

  // Smoothly interpolate user swipe rotation
  userOrbit += (userOrbitTarget - userOrbit) * 0.1;

  // ── SCROLL PHASES ─────────────────────────────────────────────
  const sp = scrollProgress;

  // Zones
  // Distort cloud builds up earlier to give a nice long golden phase
  const distortT = smoothstep(0.40, 0.75, sp);
  // Blue fog fades in over a much wider range to slow down the transition
  const fogT     = smoothstep(0.60, 0.90, sp);
  // Dive underwater!
  const diveT    = smoothstep(0.85, 1.00, sp);

  // Compressed zoom & rise so the initial scroll feels punchy and fast
  const zoomT  = easeInOut(Math.min(sp / 0.20, 1.0));
  const riseT  = easeOut(Math.min(Math.max((sp - 0.15) / 0.30, 0.0), 1.0));

  const camR = THREE.MathUtils.lerp(CAM_NEAR_R, CAM_FAR_R, zoomT);
  const orbit = riseT * Math.PI * 1.5 + userOrbit;   // combine scroll orbit and user swipe orbit
  const riseY = riseT * 28.0;
  let beamEndY = -CONE_H;

  // ── LAMP & LIGHTS ─────────────────────────────────────────────
  if (modelLoaded && lampModel) {
    lampModel.scale.setScalar(lampInitialScale);
    lampModel.position.y = lampInitialY + riseY;
    lampModel.rotation.y += 0.0005;

    bulbLight.position.y = initBulbY + riseY;
    bulbMesh.position.y = initBulbY + riseY;
    spotDown.position.y = initSpotY + riseY;
    beamGroup.position.y = initBeamY + riseY;

    // Expand the light cone and strings horizontally as user scrolls down
    const flare = 1.0 + riseT * 3.5;
    beamGroup.scale.set(flare, 1.0, flare);
  }

  beamEndY = beamGroup.position.y - CONE_H;

  // ── CAMERA (x-z plane arc, plus tilt down at the end) ────────
  const tiltT = smoothstep(0.65, 0.95, sp);
  
  let finalCamR = camR;
  let finalCamY = THREE.MathUtils.lerp(-2.5 + riseY * 0.15, beamEndY + 2.0, tiltT);
  let lookY = THREE.MathUtils.lerp(1.5 + riseY * 0.18, beamEndY, tiltT);
  
  // DIVE logic: bring camera much further down and closer in!
  finalCamY = THREE.MathUtils.lerp(finalCamY, beamEndY - 45.0, diveT);
  finalCamR = THREE.MathUtils.lerp(finalCamR, 2.0, diveT);
  // Make the camera look straight ahead or slightly down when diving, rather than looking up at the clouds
  lookY = THREE.MathUtils.lerp(lookY, beamEndY - 55.0, diveT);

  camera.position.x = Math.sin(orbit) * finalCamR;
  camera.position.z = Math.cos(orbit) * finalCamR;
  camera.position.y = finalCamY;
  lookAt.set(0, lookY, 0);
  camera.lookAt(lookAt);

  // ── FADE ──────────────────────────────────────────────────────
  const lampFade = sp < 0.65 ? 1.0 : Math.max(0, 1 - (sp - 0.65) / 0.15);
  // Fade out the light beam completely as it sinks deep into the cloud
  const beamFade = 1.0 - smoothstep(0.70, 0.95, sp);

  bulbLight.intensity = 95 * flicker * lampFade;
  spotDown.intensity = 70 * flicker * lampFade;
  bulbMesh.material.emissiveIntensity = 6 * flicker * lampFade;
  lightConeEl.style.opacity = String(lampFade);

  // Overlay text fades out quickly after zoom-out ends
  if (overlayEl) {
    // Fade out the intro text immediately after the zoom-out completes (0.20 to 0.25)
    const overlayFade = 1.0 - smoothstep(0.20, 0.25, sp);
    overlayEl.style.opacity = String(overlayFade);
  }

  // Beam particles fade out faster with barrier
  bpAMat.opacity = 0.80 * beamFade * (1.0 - distortT);
  bpBMat.opacity = 0.55 * beamFade * (1.0 - distortT);

  // Helix trails overall opacity stays constant, but particles below barrier are culled
  for (const ht of helixTrails) {
    if (ht.mat) ht.mat.opacity = beamFade * 0.55;
  }

  // ── HELIX TRAILS — update all three ───────────────────────────
  for (const ht of helixTrails) updateHelixTrail(ht, dt, distortT);

  // ── BEAM PARTICLES — drift + cone-boundary respawn ────────────
  for (let i = 0; i < BP_A; i++) {
    const v = bpAVel[i];
    bpAPos[i * 3] += v.x + Math.sin(t * 0.18 + i * 0.037) * 0.0005;
    bpAPos[i * 3 + 1] += v.y;
    bpAPos[i * 3 + 2] += v.z + Math.cos(t * 0.14 + i * 0.051) * 0.0005;
    const dp = -bpAPos[i * 3 + 1];
    const mr = (dp / CONE_H) * CONE_R;
    const d2 = bpAPos[i * 3] * bpAPos[i * 3] + bpAPos[i * 3 + 2] * bpAPos[i * 3 + 2];
    if (dp < -0.8 || dp > CONE_H * 1.08 || d2 > mr * mr * 1.9) spawnFine(i);
  }
  bpAGeo.attributes.position.needsUpdate = true;

  for (let i = 0; i < BP_B; i++) {
    const v = bpBVel[i];
    bpBPos[i * 3] += v.x + Math.sin(t * 0.10 + i * 0.08) * 0.0004;
    bpBPos[i * 3 + 1] += v.y;
    bpBPos[i * 3 + 2] += v.z + Math.cos(t * 0.08 + i * 0.09) * 0.0004;
    const dp = -bpBPos[i * 3 + 1];
    const mr = (dp / CONE_H) * CONE_R;
    const d2 = bpBPos[i * 3] * bpBPos[i * 3] + bpBPos[i * 3 + 2] * bpBPos[i * 3 + 2];
    if (dp < -0.8 || dp > CONE_H * 1.08 || d2 > mr * mr * 1.9) spawnBokeh(i);
  }
  bpBGeo.attributes.position.needsUpdate = true;

  // ── RGB PARTICLES ───────────────────────────────────────────────
  rgbMat.opacity = distortT * 0.65; // only visible when distortion cloud is active
  for (let i = 0; i < RGB_COUNT; i++) {
    const v = rgbVel[i];
    rgbPos[i * 3] += v.x + Math.sin(t * 0.2 + i) * 0.0005;
    rgbPos[i * 3 + 1] += v.y;
    rgbPos[i * 3 + 2] += v.z + Math.cos(t * 0.2 + i) * 0.0005;

    // Loop back to cloud if they fall too far
    if (rgbPos[i * 3 + 1] < -53.0) {
      rgbPos[i * 3 + 1] = -28.0; // Respawn at the cloud surface peak
    }
  }
  rgbGeo.attributes.position.needsUpdate = true;

  // ── AMBIENT PARTICLES (Trickle Filter) ────────────────────────
  const trickleT = smoothstep(0.65, 0.90, sp);
  apMat.opacity = 0.55;
  for (let i = 0; i < AP; i++) {
    const v = apVel[i];
    apPos[i * 3] += v.x + Math.sin(t * 0.3 + i) * 0.0005;
    apPos[i * 3 + 1] += v.y;
    apPos[i * 3 + 2] += v.z + Math.cos(t * 0.25 + i) * 0.0005;
    if (apPos[i * 3 + 1] > 9) { apPos[i * 3 + 1] = -9; const r = Math.random() * 9, a = Math.random() * Math.PI * 2; apPos[i * 3] = Math.cos(a) * r; apPos[i * 3 + 2] = Math.sin(a) * r - 1; }

    // Dim colors for particles that don't survive the barrier
    const particleAlpha = trickleT > 0.01
      ? 1.0 - trickleT + (i % 18 === 0 ? trickleT : 0.0)
      : 1.0;

    apCol[i * 3] = apBaseCol[i * 3] * particleAlpha;
    apCol[i * 3 + 1] = apBaseCol[i * 3 + 1] * particleAlpha;
    apCol[i * 3 + 2] = apBaseCol[i * 3 + 2] * particleAlpha;
  }
  apGeo.attributes.position.needsUpdate = true;
  apGeo.attributes.color.needsUpdate = true;
  stars.rotation.y += 0.00005;

  // ── DISTORTION & FOG ──────────────────────────────────────────
  if (distortPlane) {
    distortPlane.visible = distortT > 0.005;
    distortMat.uniforms.uTime.value = t;
    distortMat.uniforms.uDistortT.value = distortT;
    distortPlane.position.y = beamEndY - 1.0;
    distortPlane.rotation.z = t * 0.005; // much slower spin
  }

  if (fogDisc) {
    fogDisc.position.y = beamEndY - 2.5;
    const pulse = 1.0 + Math.sin(t * 0.2) * 0.05;
    fogDisc.rotation.z = -t * 0.02;
    fogDisc.scale.set(pulse, pulse, pulse);
    fogDiscMat.opacity = (0.45 + Math.sin(t * 0.4) * 0.08) * Math.max(distortT, fogT);
  }

  if (fogLayerEl) {
    fogLayerEl.style.opacity = Math.max(0, fogT * 0.85 + diveT * 0.15);
  }

  if (nextSectionEl) {
    if (fogT > 0.88) nextSectionEl.classList.add('visible');
    else nextSectionEl.classList.remove('visible');
  }

  if (welcomeTextEl) {
    // Fade in a little after intro text disappears (0.26 to 0.35), fade out as the blue fog rolls in (0.70 to 0.80)
    const welcomeFadeIn = smoothstep(0.26, 0.35, sp);
    const welcomeFadeOut = smoothstep(0.70, 0.80, sp);
    welcomeTextEl.style.opacity = String(welcomeFadeIn * (1.0 - welcomeFadeOut));
  }

  // ── 2-D STREAKS ───────────────────────────────────────────────
  bulbMesh.getWorldPosition(_wp);
  const sc = worldToScreen(_wp);
  drawStreaks(t, sc.x, sc.y, flicker, lampFade);

  composer.render();

  // ── SCROLL INDICATOR ────────────────────────────────────────
  if (scrollDashes.length > 0) {
    const total = scrollDashes.length;
    let activeIdx = Math.floor(scrollProgress * total);
    if (activeIdx >= total) activeIdx = total - 1;
    scrollDashes.forEach((d, i) => {
      if (i === activeIdx) d.classList.add('active');
      else d.classList.remove('active');
    });
  }
}

animate();
