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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ── DOM ──────────────────────────────────────────────────────────
const canvas = document.getElementById('three-canvas');
const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderTxt = document.getElementById('loader-text');
const lightConeEl = document.getElementById('light-cone');
const streakCanvas = document.getElementById('streak-canvas');
const overlayEl = document.getElementById('overlay');
const welcomeTextEl = document.getElementById('welcome-text');
// (fogLayerEl removed)
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
// Lower pixel ratio max for much better performance (smooth & light)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
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

// ──────────────────────────────────────────────────────────────────
//  CUSTOM RGB GLITCH SHADER PASS (Phase 5)
// ──────────────────────────────────────────────────────────────────
const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    varying vec2 vUv;
    
    // Quick noise
    float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      float intensity = uAmount;

      // Scanline tears
      float r1 = rand(vec2(uTime, uv.y));
      if(r1 < intensity * 0.2) {
        uv.x += (rand(vec2(uTime * 2.0, uv.y)) - 0.5) * intensity * 0.3;
      }
      
      // Chromatic Aberration
      vec2 offset = vec2(intensity * 0.05, 0.0);
      vec4 cr = texture2D(tDiffuse, uv + offset);
      vec4 cg = texture2D(tDiffuse, uv);
      vec4 cb = texture2D(tDiffuse, uv - offset);
      
      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `
};

const glitchPass = new ShaderPass(GlitchShader);
composer.addPass(glitchPass);

// ── Easing ────────────────────────────────────────────────────────
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 2.4);
const smoothstep = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// ── Scroll ────────────────────────────────────────────────────────
let scrollProgress = 0;

// ── LENIS SMOOTH SCROLL ───────────────────────────────────────────
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

lenis.on('scroll', ({ progress }) => {
  scrollProgress = progress;
});

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
//  VOLUMETRIC SMOKE SPHERE (Phase 2)
// ──────────────────────────────────────────────────────────────────
const smokeVS = `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const smokeFS = `
  varying vec2 vUv;
  varying vec3 vPos;
  uniform float uTime;
  uniform float uDistortT;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.02; f += 0.2500 * noise(p); p *= 2.03;
    f += 0.1250 * noise(p); p *= 2.01; f += 0.0625 * noise(p); return f / 0.9375;
  }

  void main() {
    float d = length(vPos);
    float alphaEdge = smoothstep(22.0, 15.0, d);
    
    vec3 p = vPos * 0.15 + vec3(0.0, uTime * -0.5, uTime * 0.2);
    float n = fbm(p);
    float n2 = fbm(p * 2.0 - vec3(uTime));
    
    vec3 colA = vec3(1.0, 0.6, 0.1);
    vec3 colB = vec3(0.1, 0.4, 1.0);
    vec3 finalCol = mix(colA, colB, smoothstep(0.0, 1.0, uColorT) + n2 * 0.15);
    
    float alpha = n * alphaEdge * (uDistortT * 0.85);
    gl_FragColor = vec4(finalCol, alpha);
  }
`;
const smokeSphereGeo = new THREE.SphereGeometry(22, 64, 64);
const smokeSphereMat = new THREE.ShaderMaterial({
  vertexShader: smokeVS,
  fragmentShader: smokeFS,
  uniforms: {
    uTime: { value: 0 },
    uDistortT: { value: 0 },
    uColorT: { value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
});
const smokeSphere = new THREE.Mesh(smokeSphereGeo, smokeSphereMat);
smokeSphere.position.set(0, -32, 0); // Positioned in the deep dive area
smokeSphere.visible = false;
scene.add(smokeSphere);

// ──────────────────────────────────────────────────────────────────
//  REFLECTIVE GLASS FLOOR (Phase 3)
// ──────────────────────────────────────────────────────────────────
const floorRenderTarget = new THREE.WebGLCubeRenderTarget(128);
const floorCubeCam = new THREE.CubeCamera(0.1, 100, floorRenderTarget);
floorCubeCam.position.set(0, -34.5, 0);
scene.add(floorCubeCam);

const floorGeo = new THREE.PlaneGeometry(120, 120);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x050505,
  roughness: 0.1,
  metalness: 0.9,
  envMap: floorRenderTarget.texture,
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.set(0, -35, 0);
scene.add(floorMesh);

// ──────────────────────────────────────────────────────────────────
//  IMPACT SHOCKWAVE (Floor Ring Ripple)
// ──────────────────────────────────────────────────────────────────
const shockwaveGroup = new THREE.Group();
shockwaveGroup.position.set(0, -34.9, 0); // Just above floor to prevent z-fighting
shockwaveGroup.rotation.x = -Math.PI / 2;
scene.add(shockwaveGroup);

// --- Light Flash ---
const impactLight = new THREE.PointLight(0x0088ff, 0, 80);
shockwaveGroup.add(impactLight);

// --- Volumetric Blue Smoke (Impact) ---
const impactSmokeGeo = new THREE.BufferGeometry();
const impactSmokeCount = 150;
const impactSmokePos = new Float32Array(impactSmokeCount * 3);
const impactSmokeVel = new Float32Array(impactSmokeCount * 3);

for(let i=0; i<impactSmokeCount; i++){
    // Spread in a circle
    const theta = Math.random() * Math.PI * 2;
    // They will spawn at center and expand, so initial pos is 0
    impactSmokePos[i*3] = 0;
    impactSmokePos[i*3+1] = 0;
    impactSmokePos[i*3+2] = 0;
    
    // Velocity outwards (remember group is rotated, so X and Y are floor plane, Z is UP)
    const speed = 2.0 + Math.random() * 8.0;
    impactSmokeVel[i*3] = Math.cos(theta) * speed;
    impactSmokeVel[i*3+1] = Math.sin(theta) * speed; // this is Z in world coords
    impactSmokeVel[i*3+2] = 1.0 + Math.random() * 4.0; // UP in local coords
}
impactSmokeGeo.setAttribute('position', new THREE.BufferAttribute(impactSmokePos, 3));

// We'll reuse the circleTex for soft smoke
const impactSmokeMat = new THREE.PointsMaterial({
    size: 2.0,
    color: 0x0055ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: circleTex,
    alphaTest: 0.01
});
const impactSmoke = new THREE.Points(impactSmokeGeo, impactSmokeMat);
shockwaveGroup.add(impactSmoke);

const ring1Geo = new THREE.RingGeometry(0.8, 1.0, 64);
const ring1Mat = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, blending: THREE.AdditiveBlending, opacity: 0, depthWrite: false });
const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
shockwaveGroup.add(ring1);

const ring2Geo = new THREE.RingGeometry(0.95, 1.0, 64);
const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, blending: THREE.AdditiveBlending, opacity: 0, depthWrite: false });
const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
shockwaveGroup.add(ring2);

// ──────────────────────────────────────────────────────────────────
//  HOLOGRAPHIC CYBER-GRID (Virtual Floor)
// ──────────────────────────────────────────────────────────────────
const cyberGridGeo = new THREE.PlaneGeometry(80, 80, 128, 128); // High poly for displacement
const cyberGridMat = new THREE.ShaderMaterial({
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uColor: { value: new THREE.Color(0xff2255) }, // Neon red-pink to match glitch
    uOpacity: { value: 0.0 },
    uImpactDist: { value: 0.0 },
    uImpactStrength: { value: 0.0 }
  },
  vertexShader: `
    uniform float uImpactDist;
    uniform float uImpactStrength;
    varying vec2 vUv;
    varying float vRipple;
    
    void main() {
      vUv = uv;
      vec3 pos = position;
      
      float dist = distance(uv, vec2(0.5));
      
      // Calculate a ring that expands outwards based on uImpactDist
      float wave = smoothstep(uImpactDist - 0.05, uImpactDist, dist) * (1.0 - smoothstep(uImpactDist, uImpactDist + 0.05, dist));
      
      // Displace Z (which becomes world Y after group rotation)
      // The sine wave adds physical ripples, scaled by impact strength
      float disp = wave * sin(dist * 100.0 - uImpactDist * 100.0) * uImpactStrength;
      pos.z += disp * 4.0; 
      
      vRipple = wave * uImpactStrength;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;
    varying float vRipple;
    
    void main() {
      // Generate grid lines
      vec2 grid = fract(vUv * 40.0);
      float lx = smoothstep(0.92, 1.0, grid.x) + smoothstep(0.08, 0.0, grid.x);
      float ly = smoothstep(0.92, 1.0, grid.y) + smoothstep(0.08, 0.0, grid.y);
      float lineAlpha = clamp(lx + ly, 0.0, 1.0);
      
      // Radial fade to mask the square edges
      float dist = distance(vUv, vec2(0.5));
      float radialFade = 1.0 - smoothstep(0.1, 0.5, dist);
      
      // Add a subtle glowing center
      float centerGlow = (1.0 - smoothstep(0.0, 0.15, dist)) * 0.5;
      
      // Emissive Blue Energy Flow
      float surge = smoothstep(0.0, 0.01, vRipple) * vRipple;
      vec3 finalColor = mix(uColor, vec3(0.0, 0.8, 1.0), surge);
      lineAlpha += surge; // Brighten the lines
      
      gl_FragColor = vec4(finalColor, clamp((lineAlpha + centerGlow) * radialFade * uOpacity, 0.0, 1.0));
    }
  `
});
const cyberGridMesh = new THREE.Mesh(cyberGridGeo, cyberGridMat);
// Add it to the shockwave group so it anchors perfectly to the sword
// No rotation needed here because shockwaveGroup is already rotated flat
shockwaveGroup.add(cyberGridMesh);

// ──────────────────────────────────────────────────────────────────
//  DIGITAL EMBERS (Rising from Virtual Floor)
// ──────────────────────────────────────────────────────────────────
const embersN = 300;
const embersGeo = new THREE.BufferGeometry();
const embersPos = new Float32Array(embersN * 3);
const embersCol = new Float32Array(embersN * 3);
const embersSpeed = new Float32Array(embersN);

for(let i = 0; i < embersN; i++) {
  const r = 0.5 + Math.pow(Math.random(), 2) * 12; // Concentrate more near the center
  const theta = Math.random() * Math.PI * 2;
  embersPos[i*3] = Math.cos(theta) * r;
  embersPos[i*3+1] = Math.random() * 20; // Initial random height 0 to 20
  embersPos[i*3+2] = Math.sin(theta) * r;
  
  // Mix of Neon Pink/Red and Neon Blue
  const isRed = Math.random() > 0.5;
  embersCol[i*3]   = isRed ? 1.0 : 0.0; // R
  embersCol[i*3+1] = isRed ? 0.1 : 0.6; // G
  embersCol[i*3+2] = isRed ? 0.3 : 1.0; // B
  
  // Upward speed
  embersSpeed[i] = 2.0 + Math.random() * 4.0;
}
embersGeo.setAttribute('position', new THREE.BufferAttribute(embersPos, 3));
embersGeo.setAttribute('color', new THREE.BufferAttribute(embersCol, 3));

const embersMat = new THREE.PointsMaterial({
  size: 0.2,
  vertexColors: true,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const embersMesh = new THREE.Points(embersGeo, embersMat);
scene.add(embersMesh);

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

// (RGB Particles removed)

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

// ── SWORD & PRECURSOR ─────────────────────────────────────────────
let swordModel = null;
let swordLoaded = false;
let swordStartYLatched = null; // Used to latch the Y position at the morph threshold

gltfLdr.load('./sword.glb', (gltf) => {
  swordModel = gltf.scene;
  // Auto-scale sword to be ~6 units long max
  const box = new THREE.Box3().setFromObject(swordModel);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  // Prevent division by zero if geometry is empty
  const baseScale = maxDim > 0 ? 6.0 / maxDim : 1.0;
  
  swordModel.scale.setScalar(0); // starts at 0, animated in animate()
  swordModel.userData.baseScale = baseScale; // Store for the animate loop
  
  // Center the sword geometry around its local origin
  const center = box.getCenter(new THREE.Vector3());
  swordModel.traverse(c => {
    if (c.isMesh) {
      c.geometry.translate(-center.x, -center.y, -center.z);
    }
  });

  swordModel.rotation.x = Math.PI; // tip pointing downward
  swordModel.visible = false;
  
  swordModel.traverse(c => {
    if (!c.isMesh) return;
    c.castShadow = true;
    if (c.material) {
      c.material.envMapIntensity = 2.0; // Boost environmental reflections slightly
      c.material.needsUpdate = true;
    }
  });
  
  // External lights to illuminate the blade without altering its real color
  const bladeLight1 = new THREE.PointLight(0xffaa00, 3, 15);
  const bladeLight2 = new THREE.PointLight(0xffaa00, 3, 15);
  scene.add(bladeLight1);
  scene.add(bladeLight2);
  // Store them on the sword model object for easy access in animate()
  swordModel.userData.lights = [bladeLight1, bladeLight2];
  
  scene.add(swordModel);
  swordLoaded = true;
}, undefined, (err) => console.error('sword:', err));

// — Sword Precursor Particle ——————————————————————————
const precursorGeo = new THREE.SphereGeometry(0.12, 16, 16);
const precursorMat = new THREE.MeshStandardMaterial({
  color: 0xffd080,
  emissive: 0xffa030,
  emissiveIntensity: 8,
  transparent: true,
  opacity: 0,
});
const precursorMesh = new THREE.Mesh(precursorGeo, precursorMat);
scene.add(precursorMesh);

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
let cubeFrame = 0;

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
  // Distort cloud builds up later to prevent clipping early scroll
  const distortT = smoothstep(0.60, 0.80, sp) * (1.0 - smoothstep(0.85, 0.98, sp));
  // Blue fog fades in over a much wider range to slow down the transition
  const fogT     = smoothstep(0.60, 0.90, sp);
  // Dive underwater!
  const diveT    = 0; // dive disabled — camera stays in tilt position

  // Rise now spans from 15% to 60% scroll to eliminate the 50% dead zone
  const zoomT  = easeInOut(Math.min(sp / 0.20, 1.0));
  const riseT  = easeOut(Math.min(Math.max((sp - 0.15) / 0.45, 0.0), 1.0));

  const camR = THREE.MathUtils.lerp(CAM_NEAR_R, CAM_FAR_R, zoomT);
  const orbit = riseT * Math.PI * 1.5 + userOrbit + t * 0.12;   // scroll orbit + swipe + continuous auto-rotation
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

  // ── SWORD DROP SEQUENCE ──────────────────────────────
  // Phase 1: precursor particle falls (sp 0.22 → 0.36)
  // Phase 2: sword materialises + descends (sp 0.32 → 1.00)

  const SWORD_SP_START  = 0.22; // particle appears
  const SWORD_SP_MORPH  = 0.32; // sword appears, particle fades
  const SWORD_SP_END    = 1.00; // end of scroll

  // Particle spawn Y = bulb world Y at the moment it appears
  const precursorSpawnY = initBulbY + riseY; // world Y of bulb

  // --- Precursor particle phase ---
  const particleT   = smoothstep(SWORD_SP_START, SWORD_SP_MORPH, sp);
  const particleFade = 1.0 - smoothstep(SWORD_SP_MORPH - 0.01, SWORD_SP_MORPH + 0.03, sp);

  // Particle drops 8 world units over the 0.22→0.32 scroll window
  const particleY = precursorSpawnY - particleT * 8.0;

  precursorMesh.visible = sp > SWORD_SP_START;
  precursorMesh.position.set(0, particleY, 0);
  precursorMat.opacity = particleT * particleFade;
  precursorMat.emissiveIntensity = 8 * particleT;

  // --- Sword descent phase ---
  if (swordLoaded) {
    const morphT   = smoothstep(SWORD_SP_MORPH, SWORD_SP_MORPH + 0.04, sp);
    
    // Latch the exact Y position at the morph threshold to prevent drifting
    if (sp >= SWORD_SP_MORPH && swordStartYLatched === null) {
      swordStartYLatched = precursorSpawnY - 8.0;
    }
    
    let swordY = particleY; // Default before latching
    
    if (swordStartYLatched !== null) {
      if (sp <= 0.85) {
          // Freefall down to exactly touch the grid
          const dropT = smoothstep(0.32, 0.85, sp);
          swordY = THREE.MathUtils.lerp(swordStartYLatched, beamEndY - 2.0, dropT);
      } else if (sp <= 0.95) {
          // Push deeply through the grid
          const pushT = smoothstep(0.85, 0.95, sp);
          swordY = THREE.MathUtils.lerp(beamEndY - 2.0, beamEndY - 8.0, pushT);
      } else {
          // Dive deep into the void WITH the camera
          const diveT = smoothstep(0.95, 1.0, sp);
          swordY = THREE.MathUtils.lerp(beamEndY - 8.0, beamEndY - 26.0, diveT);
      }
    }

    swordModel.visible = sp > SWORD_SP_MORPH;
    swordModel.position.set(0, swordY, 0);
    // Slow self-rotation on Y axis for visual flair
    swordModel.rotation.y = t * 0.8;
    // Scale from 0 → full over morphT for materialise effect
    const sc = morphT * swordModel.userData.baseScale;
    swordModel.scale.setScalar(sc);
    
    // Give sword a bright pulse from the external lights as it materialises
    const lightInt = THREE.MathUtils.lerp(8.0, 3.0, morphT);
    swordModel.userData.lights[0].intensity = lightInt;
    swordModel.userData.lights[0].position.set(2, swordY, 3);
    swordModel.userData.lights[0].visible = true;
    
    swordModel.userData.lights[1].intensity = lightInt;
    swordModel.userData.lights[1].position.set(-2, swordY, -3);
    swordModel.userData.lights[1].visible = true;
  } else if (swordModel && swordModel.userData.lights) {
    swordModel.userData.lights[0].visible = false;
    swordModel.userData.lights[1].visible = false;
  }
  
  // --- Sword Impact Shockwave ---
  // Expanding floor rings that trigger precisely when the sword hits the grid (85% -> 95%)
  const impactT = smoothstep(0.85, 0.95, sp);
  if (impactT > 0) { 
      const scale1 = THREE.MathUtils.lerp(1.0, 15.0, impactT);
      const scale2 = THREE.MathUtils.lerp(1.0, 25.0, Math.pow(impactT, 0.8));
      
      // Update position to be exactly at the sword's final stop point, not the physical floor!
      if (swordStartYLatched !== null) {
          shockwaveGroup.position.y = (beamEndY - 2.0); // swordEndY
      }

      // Fades IN as it expands and stays visible at the end
      const op = impactT;
      
      ring1.scale.setScalar(scale1);
      ring1Mat.opacity = op * 0.5;
      
      ring2.scale.setScalar(scale2);
      ring2Mat.opacity = op * 0.3;
      
      // Fade in the cyber grid smoothly
      cyberGridMat.uniforms.uOpacity.value = op * 0.6;
      
      // Update the cyber grid physically (Ripple wave expands based on impactT)
      cyberGridMat.uniforms.uImpactDist.value = impactT * 0.8; // Normalized UV dist is 0 to 0.5
      
      // Impact strength peaks around 0.87, then decays to 0 at 0.95
      const impactPeak = smoothstep(0.85, 0.88, sp) * (1.0 - smoothstep(0.88, 0.95, sp));
      cyberGridMat.uniforms.uImpactStrength.value = impactPeak;
      
      // Massive Flash of blue light at peak impact
      impactLight.intensity = impactPeak * 2000;
      
      // Expand Volumetric Blue Smoke based on scroll position
      impactSmokeMat.opacity = impactPeak * 0.8;
      if (impactPeak > 0) {
          const smokePos = impactSmokeGeo.attributes.position.array;
          for (let i = 0; i < impactSmokeCount; i++) {
              smokePos[i*3]   = impactSmokeVel[i*3] * impactT * 15.0;
              smokePos[i*3+1] = impactSmokeVel[i*3+1] * impactT * 15.0; 
              smokePos[i*3+2] = impactSmokeVel[i*3+2] * impactT * 15.0;
          }
          impactSmokeGeo.attributes.position.needsUpdate = true;
      }
  } else {
      ring1Mat.opacity = 0;
      ring2Mat.opacity = 0;
      cyberGridMat.uniforms.uOpacity.value = 0;
  }
  
  // --- Digital Embers ---
  if (swordStartYLatched !== null) {
      embersMesh.position.y = (beamEndY - 2.0); // Anchor to virtual floor
  }
  // Fade in embers slightly earlier to match the impact
  const embersFade = smoothstep(0.80, 0.95, sp);
  embersMat.opacity = embersFade * 0.8;
  
  if (embersFade > 0) {
      const positions = embersGeo.attributes.position.array;
      for (let i = 0; i < embersN; i++) {
          positions[i*3 + 1] += dt * embersSpeed[i];
          // Reset particle to bottom when it goes too high, and jitter X/Z slightly
          if (positions[i*3 + 1] > 20.0) {
              positions[i*3 + 1] = 0;
          }
      }
      embersGeo.attributes.position.needsUpdate = true;
  }

  // ── CAMERA (x-z plane arc, plus tilt down at the end) ────────
  // Tilt starts at 32% (when sword spawns) and ends at 85% (when sword hits grid)
  const tiltT = smoothstep(0.32, 0.85, sp);
  
  let finalCamR = camR;
  // Camera drops to track the sword, stopping slightly ABOVE the grid to watch the penetration (+1.0)
  let finalCamY = THREE.MathUtils.lerp(-2.5 + riseY * 0.15, beamEndY + 1.0, tiltT);
  // Camera looks exactly at the impact point on the grid (-2.0)
  let lookY = THREE.MathUtils.lerp(1.5 + riseY * 0.18, beamEndY - 2.0, tiltT);
  
  // Dive through the floor only AFTER the sword has penetrated (95% to 100%)
  const camDiveT = smoothstep(0.95, 1.0, sp);
  // Both drop 24 units. Since sword drops 18, the camera catches up to perfectly center the sword.
  finalCamY -= camDiveT * 24.0;
  lookY -= camDiveT * 24.0;


  camera.position.x = Math.sin(orbit) * finalCamR;
  camera.position.z = Math.cos(orbit) * finalCamR;
  camera.position.y = finalCamY;
  lookAt.set(0, lookY, 0);
  
  // --- Impact Camera Shake ---
  const shakeIntensity = smoothstep(0.85, 0.88, sp) * (1.0 - smoothstep(0.88, 0.95, sp));
  if (shakeIntensity > 0) {
      camera.position.x += (Math.random() - 0.5) * 1.5 * shakeIntensity;
      camera.position.y += (Math.random() - 0.5) * 1.5 * shakeIntensity;
      camera.position.z += (Math.random() - 0.5) * 1.5 * shakeIntensity;
  }

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

  // ── BEAM PARTICLES (Phase 4: Implosion) ────────────────────────
  // We pull particles towards the center during the 'diveT' phase
  const implosionStrength = smoothstep(0.65, 0.95, sp);
  const singularityY = beamEndY - 25.0; // Center of the smoke sphere

  for (let i = 0; i < BP_A; i++) {
    const v = bpAVel[i];
    // Normal drift
    let nx = bpAPos[i * 3] + v.x + Math.sin(t * 0.18 + i * 0.037) * 0.0005;
    let ny = bpAPos[i * 3 + 1] + v.y;
    let nz = bpAPos[i * 3 + 2] + v.z + Math.cos(t * 0.14 + i * 0.051) * 0.0005;

    // Implosion pull
    if (implosionStrength > 0) {
      nx = THREE.MathUtils.lerp(nx, 0, implosionStrength * 0.05);
      ny = THREE.MathUtils.lerp(ny, singularityY, implosionStrength * 0.05);
      nz = THREE.MathUtils.lerp(nz, 0, implosionStrength * 0.05);
    }

    bpAPos[i * 3] = nx; bpAPos[i * 3 + 1] = ny; bpAPos[i * 3 + 2] = nz;
    
    const dp = -ny;
    const mr = (dp / CONE_H) * CONE_R;
    const d2 = nx * nx + nz * nz;
    if (dp < -0.8 || dp > CONE_H * 1.08 || d2 > mr * mr * 1.9) spawnFine(i);
  }
  bpAGeo.attributes.position.needsUpdate = true;

  for (let i = 0; i < BP_B; i++) {
    const v = bpBVel[i];
    let nx = bpBPos[i * 3] + v.x + Math.sin(t * 0.10 + i * 0.08) * 0.0004;
    let ny = bpBPos[i * 3 + 1] + v.y;
    let nz = bpBPos[i * 3 + 2] + v.z + Math.cos(t * 0.08 + i * 0.09) * 0.0004;

    if (implosionStrength > 0) {
      nx = THREE.MathUtils.lerp(nx, 0, implosionStrength * 0.05);
      ny = THREE.MathUtils.lerp(ny, singularityY, implosionStrength * 0.05);
      nz = THREE.MathUtils.lerp(nz, 0, implosionStrength * 0.05);
    }

    bpBPos[i * 3] = nx; bpBPos[i * 3 + 1] = ny; bpBPos[i * 3 + 2] = nz;

    const dp = -ny;
    const mr = (dp / CONE_H) * CONE_R;
    const d2 = nx * nx + nz * nz;
    if (dp < -0.8 || dp > CONE_H * 1.08 || d2 > mr * mr * 1.9) spawnBokeh(i);
  }
  bpBGeo.attributes.position.needsUpdate = true;

  // (RGB Particles animation removed)
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

  // ── NEW EFFECTS UPDATE (Phases 2, 3, 5) ────────────────────────
  if (smokeSphere) {
    smokeSphere.visible = distortT > 0.005;
    smokeSphereMat.uniforms.uTime.value = t;
    smokeSphereMat.uniforms.uDistortT.value = distortT;
    smokeSphereMat.uniforms.uColorT.value = fogT;
    smokeSphere.position.y = beamEndY - 20.0; // Fixed center
  }

  // Update Floor CubeCamera so reflections are live
  cubeFrame++;
  if (floorCubeCam && cubeFrame % 3 === 0) {
    floorMesh.visible = false;
    floorCubeCam.update(renderer, scene);
    floorMesh.visible = true;
  }

  // Update Glitch Pass amount and vignette (Phase 5)
  if (glitchPass) {
    glitchPass.uniforms.uTime.value = t;
    // Glitch spikes at the very end of the dive (0.90 to 0.98), then goes to 0
    let glitchIntensity = smoothstep(0.90, 0.98, sp) * (1.0 - smoothstep(0.98, 1.0, sp));
    glitchPass.uniforms.uAmount.value = glitchIntensity * 1.5;
    
    // Also fade in HTML glitch overlay
    const glitchHTML = document.getElementById('glitch-overlay');
    if (glitchHTML) glitchHTML.style.opacity = glitchIntensity * 0.8;
  }

  // (fogLayerEl opacity update removed)

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
  
  // ── CINEMATIC LETTERBOXING ────────────────────────────────────
  const cinemaTop = document.getElementById('cinema-bar-top');
  const cinemaBottom = document.getElementById('cinema-bar-bottom');
  if (cinemaTop && cinemaBottom) {
    const letterboxT = smoothstep(0.88, 0.98, sp);
    cinemaTop.style.transform = `translateY(${THREE.MathUtils.lerp(-100, 0, letterboxT)}%)`;
    cinemaBottom.style.transform = `translateY(${THREE.MathUtils.lerp(100, 0, letterboxT)}%)`;
  }

  // ── 2-D STREAKS ───────────────────────────────────────────────
  bulbMesh.getWorldPosition(_wp);
  const sc = worldToScreen(_wp);
  drawStreaks(t, sc.x, sc.y, flicker, lampFade);

  composer.render();

  // ── SCROLL INDICATOR ────────────────────────────────────────
  // Ensure the scroll indicator stays visible at all times
  document.getElementById('scroll-indicator').style.opacity = "1.0";

  const progressFill = document.getElementById('scroll-progress-fill');
  if (progressFill) progressFill.style.height = String(sp * 100) + '%';

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
